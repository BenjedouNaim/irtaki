import { type IDailyReportRepository } from '../../reports/domain/daily-report.repository.interface';
import { localDateInTimezone } from '../../reports/domain/local-date';
import { reportingWeeksIntersecting } from '../../reports/domain/reporting-week';
import {
  computeEffectiveWindow,
  computeWeeklyMetrics,
  type EffectiveWindow,
  type WeeklyMetrics,
} from '../../reports/domain/weekly-metrics-calculator';
import { type IWeeklyReportRepository } from '../../reports/domain/weekly-report.repository.interface';
import { CommitmentScoreCalculator } from '../domain/commitment-score';
import { countExpectedDaysSinceLastReport } from '../domain/expected-day-counting';
import {
  resolvePerformancePeriod,
  type PerformancePeriodName,
} from '../domain/performance-period';
import type { PerformanceDto } from './performance.dto';
import { toPerformanceDto } from './performance.mapper';

/**
 * The subject of the calculation: ONE membership, its group's week anchor
 * and archival bound, and the STUDENT's own timezone — the day-boundary
 * authority for every single-student figure (T-01, INV-27), whoever is
 * doing the reading.
 */
export interface PerformanceSubject {
  membershipId: string;
  /** `groups.recitation_day`, ISO day-of-week 1..7. */
  recitationDay: number;
  /** `groups.archived_at` as an ISO-8601 instant, null while Active. */
  archivedAt: string | null;
  /** `memberships.started_at`, `YYYY-MM-DD`. */
  startedAt: string;
  /** `memberships.ended_at`, `YYYY-MM-DD`; null while Active. */
  endedAt: string | null;
  /** `users.timezone` of the membership holder. */
  timezone: string;
}

/** The `?period=` filter, already validated by the route's query DTO. */
export interface PerformancePeriodQuery {
  period?: PerformancePeriodName;
  from?: string;
  to?: string;
}

/**
 * The membership-scoped reads DS-03 needs. Both belong to the Reports
 * module, which SA §11 draws an edge to, and both are keyed by a membership
 * id — so the caller-supplied id of API-039 and the own id of API-037 flow
 * through exactly the same three queries.
 */
export interface PerformanceReadPorts {
  weeklyReportRepository: IWeeklyReportRepository;
  dailyReportRepository: IDailyReportRepository;
}

/**
 * DS-03 `CommitmentScoreCalculator` applied to one membership over the
 * caller-supplied period — the single implementation behind API-037 (own)
 * and API-039 (a caller-supplied `membership_id`), so the two endpoints
 * cannot disagree about what a period, a week or a rate means (APIS §10.9:
 * "same shape as `/me/performance`"; TS §22).
 *
 * Nothing is stored: every figure is recomputed on each call over the
 * period P intersected with `EffectiveWindow(m)` (DEC-A10, FR-PERF-07,
 * TS §24 "Live, on every request"). Three bounded, index-backed reads serve
 * the whole payload — no caching layer exists (ADR-031).
 */
export async function computeMembershipPerformance(
  subject: PerformanceSubject,
  ports: PerformanceReadPorts,
  query: PerformancePeriodQuery,
  now: Date,
): Promise<PerformanceDto> {
  const today = localDateInTimezone(now, subject.timezone);
  const window = computeEffectiveWindow({
    startedAt: subject.startedAt,
    today,
    endedAt: subject.endedAt,
    archivedAt: archivedAtLocalDate(subject),
  });

  const period = resolvePerformancePeriod({
    period: query.period,
    from: query.from,
    to: query.to,
    today,
    recitationDay: subject.recitationDay,
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
    subject.recitationDay,
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

  const metrics = await weeklyMetrics(
    ports,
    subject.membershipId,
    weeks,
    window,
  );

  const attendedWeeks =
    elapsedWeeks.length === 0
      ? 0
      : await ports.weeklyReportRepository.countAttendedFinalisedWeeks(
          subject.membershipId,
          elapsedWeeks[0].weekStart,
          elapsedWeeks[elapsedWeeks.length - 1].weekStart,
        );

  const lastReportDate =
    await ports.dailyReportRepository.findLastReportDateByMembershipId(
      subject.membershipId,
    );

  return toPerformanceDto({
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
      recitationDay: subject.recitationDay,
    }),
  });
}

/**
 * The six weekly metrics of every week in the period, from ONE DB-IDX-01
 * range walk over the whole span — never one query per week (SA §20).
 * `WeeklyMetricsCalculator` stays the single implementation of every
 * classification and denominator (TS §22).
 */
async function weeklyMetrics(
  ports: PerformanceReadPorts,
  membershipId: string,
  weeks: ReturnType<typeof reportingWeeksIntersecting>,
  effectiveWindow: EffectiveWindow,
): Promise<WeeklyMetrics[]> {
  if (weeks.length === 0) {
    return [];
  }
  const reports =
    await ports.dailyReportRepository.findDaySnapshotsByMembershipAndRange(
      membershipId,
      weeks[0].weekStart,
      weeks[weeks.length - 1].weekEnd,
    );

  return weeks.map((week) =>
    computeWeeklyMetrics({ week, effectiveWindow, reports }),
  );
}

/** `groups.archived_at` (an instant) as a date in the student's timezone (DEC-B03). */
function archivedAtLocalDate(subject: PerformanceSubject): string | null {
  return subject.archivedAt
    ? localDateInTimezone(new Date(subject.archivedAt), subject.timezone)
    : null;
}

/** ISO `YYYY-MM-DD` strings order lexicographically, so `<` is date order. */
function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
