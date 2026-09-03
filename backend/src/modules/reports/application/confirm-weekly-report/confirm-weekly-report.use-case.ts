import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WeeklyReportFinalisedEvent } from '../../domain/events/weekly-report-finalised.event';
import { isRecitationDayOf } from '../../domain/weekly-report-finalisation';
import {
  type IWeeklyReportRepository,
  WEEKLY_REPORT_REPOSITORY,
} from '../../domain/weekly-report.repository.interface';
import { toWeeklyReportDto } from '../weekly-report.mapper';
import { ConfirmWeeklyReportDto } from './confirm-weekly-report.dto';
import { ConfirmWeeklyReportResponseDto } from './confirm-weekly-report-response.dto';

const ALREADY_FINALISED_MESSAGE =
  'تم اعتماد هذا التقرير الأسبوعي مسبقاً ولا يمكن تعديله';
const NOT_RECITATION_DAY_MESSAGE =
  'لا يمكن تأكيد التقرير الأسبوعي إلا في يوم التسميع';

/**
 * UC-06 / F-WR-02 / API-034 `POST /weekly-reports/{id}/confirm` — a Student
 * declares recitation attendance and finalises the week (ST-06
 * `Open → Finalised`, Student path).
 *
 * Order of checks (UC-06, TS §21 "Application" layer):
 *  1. Own scope — the NFR-19 repository backstop behind
 *     `OwnWeeklyReportScopeGuard`: one primary-key lookup joined on the
 *     caller's membership; zero rows → uniform `403 SCOPE_DENIED` (NFR-20).
 *  2. Already `Finalised` → `409 ALREADY_FINALISED` (VR-36, UC-06 E2).
 *     Checked BEFORE the day rule: once the scheduler has defaulted the
 *     week it is also no longer the recitation day, and UF §16 wants that
 *     case answered as the 409 ("scheduler beat the student").
 *  3. Today, in `User.timezone` (T-01), is `week_end` → else
 *     `422 NOT_RECITATION_DAY` (VR-21, UC-06 E1, EC-41). An Open row whose
 *     day has passed (a missed tick, EC-24) is therefore never confirmable
 *     retroactively (BR-30, SAS §19.6).
 *  4. One auto-committed UPDATE guarded by `state = 'Open'` (TS §19 "single
 *     update, state transition"; TS §20): zero rows → the same 409 — a
 *     double tap or the scheduler won the race. DB-CHK-08 backstops it.
 *  5. DE-07 WeeklyReportFinalised, post-commit, fire-and-forget (ADR-026/032).
 *
 * Snapshot: the six metrics are NOT recomputed here — they were computed
 * once at row creation (DBD §14, WeeklyMetricsCalculator) and the row is
 * what is frozen (SAS §9 E-06 design note); only the four DB-CHK-08
 * mutable columns change.
 */
@Injectable()
export class ConfirmWeeklyReportUseCase {
  constructor(
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepository: IWeeklyReportRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    userId: string,
    reportId: string,
    dto: ConfirmWeeklyReportDto,
    now: Date = new Date(),
  ): Promise<ConfirmWeeklyReportResponseDto> {
    // 1. Own scope (backstop).
    const report = await this.weeklyReportRepository.findOwnById(
      reportId,
      userId,
    );
    if (!report) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      });
    }

    // 2. VR-36.
    if (report.state === 'Finalised') {
      throw alreadyFinalised();
    }

    // 3. VR-21.
    if (!isRecitationDayOf(report.weekEnd, now, report.timezone)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'NOT_RECITATION_DAY',
        message: NOT_RECITATION_DAY_MESSAGE,
      });
    }

    // 4. Single guarded UPDATE.
    const finalised = await this.weeklyReportRepository.finaliseByStudent({
      reportId: report.id,
      attendedRecitationCall: dto.attended_recitation_call,
      finalisedBy: userId,
      finalisedAt: now,
    });
    if (!finalised) {
      throw alreadyFinalised();
    }

    // 5. DE-07, post-commit, fire-and-forget.
    try {
      this.eventEmitter.emit(
        WeeklyReportFinalisedEvent.EVENT_NAME,
        new WeeklyReportFinalisedEvent(
          finalised.membershipId,
          { weekStart: finalised.weekStart, weekEnd: finalised.weekEnd },
          finalised.attendedRecitationCall,
          finalised.finalisedBy,
        ),
      );
    } catch {
      // Event emission failure must never fail the confirmation (ADR-032).
    }

    return { data: toWeeklyReportDto(finalised) };
  }
}

function alreadyFinalised(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'ALREADY_FINALISED',
    message: ALREADY_FINALISED_MESSAGE,
  });
}
