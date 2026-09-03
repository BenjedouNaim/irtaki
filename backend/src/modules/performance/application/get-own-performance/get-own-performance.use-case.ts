import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DAILY_REPORT_REPOSITORY,
  type IDailyReportRepository,
} from '../../../reports/domain/daily-report.repository.interface';
import { localDateInTimezone } from '../../../reports/domain/local-date';
import { reportingWeeksIntersecting } from '../../../reports/domain/reporting-week';
import {
  computeEffectiveWindow,
  computeWeeklyMetrics,
  type EffectiveWindow,
  type WeeklyMetrics,
} from '../../../reports/domain/weekly-metrics-calculator';
import {
  type CurrentWeekContextRecord,
  type IWeeklyReportRepository,
  WEEKLY_REPORT_REPOSITORY,
} from '../../../reports/domain/weekly-report.repository.interface';
import { CommitmentScoreCalculator } from '../../domain/commitment-score';
import { countExpectedDaysSinceLastReport } from '../../domain/expected-day-counting';
import { resolvePerformancePeriod } from '../../domain/performance-period';
import { toPerformanceDto } from '../performance.mapper';
import { GetOwnPerformanceQueryDto } from './get-own-performance-query.dto';
import { GetOwnPerformanceResponseDto } from './performance-response.dto';

/**
 * F-PERF-01 / API-037 `GET /me/performance?period=` — a Student reads their
 * own commitment score and performance breakdown over a selectable period
 * (FR-PERF-05, UC-02).
 *
 * Scope: own Active membership, resolved by ONE indexed lookup inside the
 * Reports module's own repository (TS §15.2). Performance owns no table and
 * is a pure derivation over Reports/Memberships/Progress reads (SA §11,
 * TS §11) — it reuses API-033's context query rather than opening a second
 * path to `memberships`. A Student with no Active membership gets
 * `404 NOT_FOUND`, mirroring API-033 and API-041.
 *
 * Nothing here is stored: DS-03 is recomputed on every call, over the
 * caller-supplied period intersected with `EffectiveWindow(m)` (DEC-A10,
 * FR-PERF-07, TS §24 "Live, on every request"). Four bounded, index-backed
 * reads serve the whole response — no caching layer exists (ADR-031).
 */
@Injectable()
export class GetOwnPerformanceUseCase {
  constructor(
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepository: IWeeklyReportRepository,
    @Inject(DAILY_REPORT_REPOSITORY)
    private readonly dailyReportRepository: IDailyReportRepository,
  ) {}

  async execute(
    userId: string,
    query: GetOwnPerformanceQueryDto,
    now: Date = new Date(),
  ): Promise<GetOwnPerformanceResponseDto> {
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
    const window = computeEffectiveWindow({
      startedAt: context.startedAt,
      today,
      endedAt: context.endedAt,
      archivedAt: archivedAtLocalDate(context),
    });

    const period = resolvePerformancePeriod({
      period: query.period,
      from: query.from,
      to: query.to,
      today,
      recitationDay: context.recitationDay,
    });

    // The reporting weeks intersecting P (SAS §18.3, DEC-A10) — the day sets
    // D_eff(P) and D_memo(P) are the union of their EffectiveDays /
    // MemorizationExpectedDays. §18.3: "All four components are computed over
    // the caller-supplied period P, INTERSECTED WITH EffectiveWindow(m)
    // (FR-PERF-07)" — so the walk stops at `window.to`, which truncates at
    // `groups.archived_at` (FR-WR-10, BR-42: an Archived group produces no
    // further weekly report) as well as at today. That also bounds the walk to
    // the membership's own lifetime, whatever a custom range asks for.
    const weeks = reportingWeeksIntersecting(
      maxDate(period.from, window.from),
      minDate(period.to, window.to),
      context.recitationDay,
    );

    // `weeks elapsed`, AttendanceRate's denominator (SRS §9.4.3, DEC-A10):
    // only the weeks whose recitation day has already passed. DEC-A03 —
    // "the recitation day contributes only to the Weekly Report and to
    // AttendanceRate" — so a week that has not reached its recitation day
    // has fed nothing into attendance yet, and §18.2 leaves the answer
    // itself undetermined until student-local midnight of that day. Counting
    // the running week would score it 0 and drag the mean down for data that
    // does not exist yet — EC-44 ("enrolled less than one week, weeks
    // elapsed = 0 → AttendanceRate undefined and excluded") and AC-26 (a
    // fully-excused week yields a NULL score, "never 0"). The bound is
    // `window.to`, not today, so a week whose recitation day falls after the
    // group was archived — and therefore never produced an E-06 row (BR-42) —
    // is excluded too.
    const elapsedWeeks = weeks.filter((week) => week.weekEnd < window.to);

    const metrics = await this.weeklyMetrics(
      context.membershipId,
      weeks,
      window,
    );

    const attendedWeeks =
      elapsedWeeks.length === 0
        ? 0
        : await this.weeklyReportRepository.countAttendedFinalisedWeeks(
            context.membershipId,
            elapsedWeeks[0].weekStart,
            elapsedWeeks[elapsedWeeks.length - 1].weekStart,
          );

    const lastReportDate =
      await this.dailyReportRepository.findLastReportDateByMembershipId(
        context.membershipId,
      );

    return {
      data: toPerformanceDto({
        score: CommitmentScoreCalculator.calculate({
          weeks: metrics,
          weekCount: elapsedWeeks.length,
          attendedWeeks,
        }),
        repetitionQuality: CommitmentScoreCalculator.repetitionQuality(metrics),
        dayBreakdown: CommitmentScoreCalculator.dayBreakdown(metrics),
        // Recency is absolute, never period-scoped: the figure mirrors the
        // at-risk predicate, which always looks backwards from today
        // (SAS §18.4).
        daysSinceLastReport: countExpectedDaysSinceLastReport({
          lastReportDate,
          window,
          recitationDay: context.recitationDay,
        }),
      }),
    };
  }

  /**
   * The six weekly metrics of every week in the period, from ONE DB-IDX-01
   * range walk over the whole span — never one query per week (SA §20).
   * `WeeklyMetricsCalculator` stays the single implementation of every
   * classification and denominator (TS §22).
   */
  private async weeklyMetrics(
    membershipId: string,
    weeks: ReturnType<typeof reportingWeeksIntersecting>,
    effectiveWindow: EffectiveWindow,
  ): Promise<WeeklyMetrics[]> {
    if (weeks.length === 0) {
      return [];
    }
    const reports =
      await this.dailyReportRepository.findDaySnapshotsByMembershipAndRange(
        membershipId,
        weeks[0].weekStart,
        weeks[weeks.length - 1].weekEnd,
      );

    return weeks.map((week) =>
      computeWeeklyMetrics({ week, effectiveWindow, reports }),
    );
  }
}

/** `groups.archived_at` (an instant) as a date in the student's timezone (DEC-B03). */
function archivedAtLocalDate(context: CurrentWeekContextRecord): string | null {
  return context.archivedAt
    ? localDateInTimezone(new Date(context.archivedAt), context.timezone)
    : null;
}

/** ISO `YYYY-MM-DD` strings order lexicographically, so `<` is date order. */
function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
