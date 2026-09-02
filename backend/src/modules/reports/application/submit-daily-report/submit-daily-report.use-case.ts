import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AyahRange } from '../../../progress/domain/ayah-range';
import { SurahOrdinalInfo } from '../../../progress/domain/ayah-position';
import { InvalidCoverageIntervalError } from '../../../progress/domain/coverage.errors';
import {
  COVERAGE_REPOSITORY,
  type ICoverageRepository,
} from '../../../progress/domain/coverage.repository.interface';
import {
  SURAH_REPOSITORY,
  type ISurahRepository,
} from '../../../progress/domain/surah.repository.interface';
import { UpdateCoverageUseCase } from '../../../progress/application/update-coverage/update-coverage.use-case';
import {
  DAILY_REPORT_REPOSITORY,
  type IDailyReportRepository,
} from '../../domain/daily-report.repository.interface';
import { DailyReport } from '../../domain/daily-report.entity';
import { DailyReportValidationError } from '../../domain/daily-report.errors';
import { evaluateDailyReportEligibility } from '../../domain/daily-report-eligibility';
import { DailyReportSubmittedEvent } from '../../domain/events/daily-report-submitted.event';
import { isoDayOfWeek, localDateInTimezone } from '../../domain/local-date';
import { TimeWindow } from '../../domain/time-window';
import { toDailyReportDto } from '../daily-report.mapper';
import {
  AyahRangeInputDto,
  SubmitDailyReportDto,
  TimeWindowInputDto,
} from './submit-daily-report.dto';
import { SubmitDailyReportResponseDto } from './submit-daily-report-response.dto';

const DUPLICATE_REPORT_MESSAGE = 'لقد قمت بإرسال تقرير اليوم مسبقاً';

/**
 * UC-05 / F-DR-02 / API-030 `POST /daily-reports` — a Student records
 * today's activity immutably.
 *
 * Order of checks (SAS §12 UC-05, TS §21 "Application" layer):
 *  1. Own Active membership → else 403 (VR-35, membership inactive).
 *  2. Group Active → else 403 (VR-35 / FR-DR-11).
 *  3. Today (in `User.timezone`, T-01/INV-27) is not the recitation day →
 *     else `422 RECITATION_DAY` (VR-12).
 *  4. `report_date`, when sent, equals today → else `422 BACKDATED`
 *     (VR-10, no grace period).
 *  5. Domain construction: AyahRange (VO-02, BR-52/VR-13/VR-14a — the
 *     Progress module's VO, never duplicated), TimeWindow (VO-03, VR-15),
 *     DailyReport (E-05 type/field rules) → `422` field-level `details`.
 *  6. Existing-report pre-check → `409 DUPLICATE_REPORT` with the full
 *     existing report (APIQ-09). This is only the fast path — the real
 *     guarantee is DB-UQ-04, whose violation is translated to the same 409
 *     after re-reading the winner (TS §20, API-X05).
 *  7. Single auto-committed INSERT (TS §19).
 *  8. DS-05: when a memorisation range is present, `UpdateCoverageUseCase`
 *     (the Progress module's exported application service) is called
 *     SYNCHRONOUSLY — not through EventEmitter2 — so the `201` can carry the
 *     post-submission `ahzab_completed` (APIS §10.7). It still runs in its
 *     own transaction, after the report has committed: a coverage failure
 *     never rolls back the report (UC-05 E5, ADR-029) — it is logged, the
 *     response says `coverage_updated: false`, and the reconciliation job
 *     repairs it.
 *  9. DE-05 DailyReportSubmitted is emitted post-commit, fire-and-forget
 *     (ADR-026/032) for its *other* consumers (day classification,
 *     FR-NOTIF-03 reminder suppression). No listener merges coverage on it.
 */
@Injectable()
export class SubmitDailyReportUseCase {
  private readonly logger = new Logger(SubmitDailyReportUseCase.name);

  constructor(
    @Inject(DAILY_REPORT_REPOSITORY)
    private readonly dailyReportRepository: IDailyReportRepository,
    @Inject(SURAH_REPOSITORY)
    private readonly surahRepository: ISurahRepository,
    @Inject(COVERAGE_REPOSITORY)
    private readonly coverageRepository: ICoverageRepository,
    private readonly updateCoverageUseCase: UpdateCoverageUseCase,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    userId: string,
    dto: SubmitDailyReportDto,
    now: Date = new Date(),
  ): Promise<SubmitDailyReportResponseDto> {
    // 1–3. Structural preconditions, same rule as API-029 so both agree.
    const context =
      await this.dailyReportRepository.findTodayContextByUserId(userId);
    if (!context) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'عضويتك في الحلقة غير نشطة؛ لا يمكن إرسال تقارير',
      });
    }

    const today = localDateInTimezone(now, context.timezone);
    const structural = evaluateDailyReportEligibility({
      membershipActive: true,
      groupLifecycleState: context.groupLifecycleState,
      recitationDay: context.recitationDay,
      todayIsoDay: isoDayOfWeek(today),
      hasReportForToday: false,
    });
    if (!structural.canSubmit) {
      if (structural.blockReason === 'group_archived') {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'SCOPE_DENIED',
          message: 'حلقتك لم تعد نشطة؛ لا يمكن إرسال تقارير جديدة',
        });
      }
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'RECITATION_DAY',
        message: 'اليوم هو يوم التسميع، ولا يُرسل فيه تقرير يومي',
      });
    }

    // 4. VR-10 — no grace period.
    if (dto.report_date !== undefined && dto.report_date !== today) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'BACKDATED',
        message: 'انتهى اليوم؛ لا يمكن إرسال تقرير لتاريخ غير تاريخ اليوم',
      });
    }

    // 5. Domain construction (FR-PROG-05: every ayah position validated
    //    against the reference dataset before anything is stored — UC-05 E1).
    const surahs = await this.surahRepository.findAll();
    const report = this.buildReport(dto, {
      membershipId: context.membershipId,
      reportDate: today,
      submittedAt: now,
      submittedTimezone: context.timezone,
      surahs,
    });

    // 6. Fast-path duplicate check (VR-11); DB-UQ-04 remains the guarantee.
    const existing = await this.dailyReportRepository.findByMembershipAndDate(
      context.membershipId,
      today,
    );
    if (existing) {
      throw this.duplicate(existing);
    }

    // 7. Single insert.
    let id: string;
    try {
      id = await this.dailyReportRepository.create(report);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        const winner = await this.dailyReportRepository.findByMembershipAndDate(
          context.membershipId,
          today,
        );
        if (winner) {
          throw this.duplicate(winner);
        }
      }
      throw err;
    }

    // 8. DS-05, synchronous, own transaction, never fatal for the report.
    const coverage = await this.applyCoverage(context.membershipId, report);

    // 9. DE-05, post-commit, fire-and-forget.
    try {
      this.eventEmitter.emit(
        DailyReportSubmittedEvent.EVENT_NAME,
        new DailyReportSubmittedEvent(
          context.membershipId,
          today,
          report.type,
          report.memoRange
            ? {
                start: {
                  surah: report.memoRange.start.surah,
                  ayah: report.memoRange.start.ayah,
                  ordinal: report.memoRange.start.ordinal,
                },
                end: {
                  surah: report.memoRange.end.surah,
                  ayah: report.memoRange.end.ayah,
                  ordinal: report.memoRange.end.ordinal,
                },
              }
            : null,
        ),
      );
    } catch {
      // Event emission failure must never fail the submission (ADR-032).
    }

    return {
      data: {
        id,
        report_date: today,
        type: report.type,
        ahzab_completed: coverage.ahzabCompleted,
        coverage_updated: coverage.updated,
      },
    };
  }

  private buildReport(
    dto: SubmitDailyReportDto,
    ctx: {
      membershipId: string;
      reportDate: string;
      submittedAt: Date;
      submittedTimezone: string;
      surahs: readonly SurahOrdinalInfo[];
    },
  ): DailyReport {
    try {
      return DailyReport.submit({
        membershipId: ctx.membershipId,
        reportDate: ctx.reportDate,
        submittedAt: ctx.submittedAt,
        submittedTimezone: ctx.submittedTimezone,
        type: dto.type,
        absenceReason: dto.absence_reason ?? undefined,
        memoRange: toRange(dto.memo_range, 'memo_range', ctx.surahs),
        memoTime: toWindow(dto.memo_time, 'memo_time'),
        completed50Repetitions: dto.completed_50_repetitions ?? undefined,
        repetitionsInSingleSession:
          dto.repetitions_in_single_session ?? undefined,
        revRange: toRange(dto.rev_range, 'rev_range', ctx.surahs),
        revTime: toWindow(dto.rev_time, 'rev_time'),
        readTafsir: dto.read_tafsir ?? undefined,
      });
    } catch (err: unknown) {
      if (err instanceof DailyReportValidationError) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: err.message,
          details: err.details,
        });
      }
      throw err;
    }
  }

  private async applyCoverage(
    membershipId: string,
    report: DailyReport,
  ): Promise<{ ahzabCompleted: number | null; updated: boolean }> {
    if (report.memoRange) {
      try {
        const outcome = await this.updateCoverageUseCase.execute({
          membershipId,
          memoRange: {
            start: {
              surah: report.memoRange.start.surah,
              ayah: report.memoRange.start.ayah,
            },
            end: {
              surah: report.memoRange.end.surah,
              ayah: report.memoRange.end.ayah,
            },
          },
        });
        if (outcome.status === 'updated') {
          return { ahzabCompleted: outcome.ahzabCompleted, updated: true };
        }
        this.logger.warn(
          `Coverage merge skipped for membership ${membershipId} (${outcome.reason}); report stands, reconciliation will repair`,
        );
      } catch (err: unknown) {
        // UC-05 E5 / ADR-029: the report stands; coverage drifts until the
        // reconciliation job corrects it.
        this.logger.error(
          `Coverage merge failed for membership ${membershipId} after report ${report.reportDate} was persisted: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // No merge ran (or it failed): report the current stored figure.
    const current =
      await this.coverageRepository.findByMembershipId(membershipId);
    if (!current) {
      this.logger.warn(
        `No live coverage row for membership ${membershipId} (INV-17); ahzab_completed unavailable`,
      );
    }
    return { ahzabCompleted: current?.ahzabCompleted ?? null, updated: false };
  }

  private duplicate(
    existing: Parameters<typeof toDailyReportDto>[0],
  ): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'DUPLICATE_REPORT',
      message: DUPLICATE_REPORT_MESSAGE,
      existing_report: toDailyReportDto(existing),
    });
  }
}

function toRange(
  input: AyahRangeInputDto | undefined,
  field: 'memo_range' | 'rev_range',
  surahs: readonly SurahOrdinalInfo[],
): AyahRange | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  try {
    return AyahRange.fromSurahAyah(input.from, input.to, surahs);
  } catch (err: unknown) {
    if (err instanceof InvalidCoverageIntervalError) {
      const isOrder = err.message.includes('BR-52');
      throw new DailyReportValidationError([
        {
          field,
          rule: isOrder ? 'VR-14a' : 'VR-13',
          message: isOrder
            ? 'يجب أن تكون نهاية النطاق بعد بدايته في ترتيب المصحف'
            : 'موضع الآية غير صالح وفق بيانات المصحف المرجعية',
        },
      ]);
    }
    throw err;
  }
}

function toWindow(
  input: TimeWindowInputDto | undefined,
  field: 'memo_time' | 'rev_time',
): TimeWindow | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }
  return TimeWindow.of(input.from, input.to, field);
}

/** Postgres `unique_violation` as TypeORM surfaces it (DB-UQ-04). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as {
    code?: string;
    driverError?: { code?: string; constraint?: string };
  };
  return e?.code === '23505' || e?.driverError?.code === '23505';
}
