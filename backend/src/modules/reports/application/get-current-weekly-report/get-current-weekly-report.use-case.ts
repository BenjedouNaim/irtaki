import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DAILY_REPORT_REPOSITORY,
  type IDailyReportRepository,
} from '../../domain/daily-report.repository.interface';
import { localDateInTimezone } from '../../domain/local-date';
import { reportingWeekContaining } from '../../domain/reporting-week';
import {
  computeEffectiveWindow,
  computeWeeklyMetrics,
  WeeklyMetrics,
} from '../../domain/weekly-metrics-calculator';
import {
  CurrentWeekContextRecord,
  type IWeeklyReportRepository,
  WEEKLY_REPORT_REPOSITORY,
  WeeklyReportRecord,
} from '../../domain/weekly-report.repository.interface';
import {
  WeeklyReportLiveDto,
  WeeklyReportLiveResponseDto,
} from './weekly-report-live-response.dto';

/**
 * F-WR-01 / API-033 `GET /weekly-reports/current` — a Student reads the
 * six-metric summary of the reporting week containing today.
 *
 * Scope: own Active membership, resolved by the Reports module's own
 * repository in one indexed lookup (TS §15.2; SA §11: Reports calls into
 * no other module). A Student with no Active membership gets
 * `404 NOT_FOUND`, mirroring `GET /me/progress` (API-041) and
 * `GET /memberships/mine` (APIQ-NEW-06).
 *
 * "Today" is the calendar date in `User.timezone` (T-01, INV-27); the
 * week is VO-04 `ReportingWeek(group, today)` (SAS §18.1, BR-15).
 *
 *  - Before the recitation day (DBD §14, ADR-003): the metrics are
 *    computed live from `daily_reports` over `EffectiveWindow(m)` — which
 *    ends today, so only the days already reached are expected — and
 *    nothing is written. `id` is `null`, `can_confirm` is `false`.
 *  - On the recitation day: the `weekly_reports` row exists — created on
 *    entering that day or, as here, lazily on first read (E-06 "Create",
 *    ST-06 "→ Open") — with `expected_days` and the five `missed_*`
 *    metrics computed once by the same calculator and stored NOT NULL,
 *    since every day they depend on is already past (BR-21/22). The stored
 *    row is returned; `can_confirm` is `true` while it is `Open` (UF §16).
 *    An Archived group produces no weekly report (BR-42, ST-06 guard):
 *    the metrics are shown live, truncated at `archived_at`, with no row.
 */
@Injectable()
export class GetCurrentWeeklyReportUseCase {
  constructor(
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepository: IWeeklyReportRepository,
    @Inject(DAILY_REPORT_REPOSITORY)
    private readonly dailyReportRepository: IDailyReportRepository,
  ) {}

  async execute(
    userId: string,
    now: Date = new Date(),
  ): Promise<WeeklyReportLiveResponseDto> {
    const context =
      await this.weeklyReportRepository.findCurrentWeekContextByUserId(userId);
    if (!context) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    const today = localDateInTimezone(now, context.timezone);
    const week = reportingWeekContaining(today, context.recitationDay);
    const isRecitationDay = today === week.weekEnd;

    if (isRecitationDay) {
      const existing =
        await this.weeklyReportRepository.findByMembershipAndWeekStart(
          context.membershipId,
          week.weekStart,
        );
      if (existing) {
        return { data: toStoredDto(existing) };
      }
    }

    const metrics = computeWeeklyMetrics({
      week,
      effectiveWindow: computeEffectiveWindow({
        startedAt: context.startedAt,
        today,
        endedAt: context.endedAt,
        archivedAt: archivedAtLocalDate(context),
      }),
      reports:
        await this.dailyReportRepository.findDaySnapshotsByMembershipAndRange(
          context.membershipId,
          week.weekStart,
          week.weekEnd,
        ),
    });

    if (isRecitationDay && context.groupLifecycleState !== 'Archived') {
      const row = await this.weeklyReportRepository.createIfAbsent({
        membershipId: context.membershipId,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        metrics,
      });
      return { data: toStoredDto(row) };
    }

    return { data: toLiveDto(week.weekStart, week.weekEnd, metrics) };
  }
}

/** `groups.archived_at` (an instant) as a date in the student's timezone (DEC-B03). */
function archivedAtLocalDate(context: CurrentWeekContextRecord): string | null {
  return context.archivedAt
    ? localDateInTimezone(new Date(context.archivedAt), context.timezone)
    : null;
}

function toLiveDto(
  weekStart: string,
  weekEnd: string,
  metrics: WeeklyMetrics,
): WeeklyReportLiveDto {
  return {
    id: null,
    week_start: weekStart,
    week_end: weekEnd,
    expected_days: metrics.expectedDays,
    missed_daily_reports: metrics.missedDailyReports,
    missed_daily_memorization: metrics.missedDailyMemorization,
    missed_daily_revision: metrics.missedDailyRevision,
    missed_50_repetitions: metrics.missed50Repetitions,
    missed_single_session: metrics.missedSingleSession,
    // FR-WR-06 default; no row carries a confirmation yet.
    attended_recitation_call: false,
    state: 'Open',
    can_confirm: false,
  };
}

function toStoredDto(row: WeeklyReportRecord): WeeklyReportLiveDto {
  return {
    id: row.id,
    week_start: row.weekStart,
    week_end: row.weekEnd,
    expected_days: row.expectedDays,
    missed_daily_reports: row.missedDailyReports,
    missed_daily_memorization: row.missedDailyMemorization,
    missed_daily_revision: row.missedDailyRevision,
    missed_50_repetitions: row.missed50Repetitions,
    missed_single_session: row.missedSingleSession,
    attended_recitation_call: row.attendedRecitationCall,
    state: row.state,
    // Confirmable exactly once, on the recitation day, while Open (VR-21,
    // VR-36); a row read on that day is by construction that day's.
    can_confirm: row.state === 'Open',
  };
}
