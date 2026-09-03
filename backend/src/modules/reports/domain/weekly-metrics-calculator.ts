import {
  classifyDay,
  DailyReportDaySnapshot,
  DayClassification,
} from './day-classification';
import { addDays } from './local-date';
import { ReportingWeek } from './reporting-week';

/**
 * `EffectiveWindow(membership m)` (SAS §18.1, FR-WR-09/10, DEC-C03):
 *   [ m.started_at , min( today , m.ended_at ?? ∞ , m.group.archived_at ?? ∞ ) ]
 * Both bounds are inclusive `YYYY-MM-DD` dates in the student's timezone.
 */
export interface EffectiveWindow {
  from: string;
  to: string;
}

export interface EffectiveWindowInput {
  /** `memberships.started_at` (DATE). */
  startedAt: string;
  /** Today in `User.timezone` (T-01, INV-27). */
  today: string;
  /** `memberships.ended_at` (DATE), null while Active. */
  endedAt: string | null;
  /** `groups.archived_at` as a student-local calendar date, null while Active. */
  archivedAt: string | null;
}

/** ISO `YYYY-MM-DD` strings order lexicographically, so `<` is date order. */
function minDate(...dates: Array<string | null>): string {
  return dates
    .filter((d): d is string => d !== null)
    .reduce((min, d) => (d < min ? d : min));
}

export function computeEffectiveWindow(
  input: EffectiveWindowInput,
): EffectiveWindow {
  return {
    from: input.startedAt,
    to: minDate(input.today, input.endedAt, input.archivedAt),
  };
}

/** One dated classification input — the live E-05 row of that date, if any. */
export interface DatedDailyReportSnapshot extends DailyReportDaySnapshot {
  /** `YYYY-MM-DD` */
  reportDate: string;
}

export interface WeeklyMetricsInput {
  week: ReportingWeek;
  effectiveWindow: EffectiveWindow;
  /** The membership's live reports whose date falls inside `week` (any order). */
  reports: ReadonlyArray<DatedDailyReportSnapshot>;
}

/**
 * `classify()` (VO-09) tallied over `ExpectedDays(m, w)` — the five-segment
 * day breakdown UF §17 renders ("Normal · Revision · Excused · Unexcused ·
 * Missed") and `GET /me/performance` returns (APIS §10.9). Not a weekly
 * metric: no `missed_*` rule applies, and the five counts sum to
 * `expectedDays` by construction, `ABSENT_EXCUSED` days included.
 */
export interface DayBreakdown {
  normal: number;
  revision: number;
  absentExcused: number;
  absentOther: number;
  noReport: number;
}

/**
 * The DMS §8 `AbsenceReason` tally over the SAME `ExpectedDays(m, w)` the
 * `DayBreakdown` is built from — the "absence-reason breakdown" UC-07 step 4
 * names and API-038 returns as `absence_breakdown` (UF §17 "Absence reasons
 * — Group-level donut").
 *
 * Derived here rather than in the Performance module so the reason split
 * and the VO-09 classification can never disagree (TS §22): by construction
 * `sick + studying = dayBreakdown.absentExcused` (BR-24) and
 * `other = dayBreakdown.absentOther` (BR-25).
 */
export interface AbsenceBreakdown {
  sick: number;
  studying: number;
  other: number;
}

/**
 * The six E-06 metrics (SAS §18.2) plus the three §18.1 denominators
 * (`|ExpectedDays|`, `|EffectiveDays|`, `|MemorizationExpectedDays|`) and the
 * "days on which memorisation actually occurred" count that §18.2 names as
 * the quality-rate denominator — so DS-03 (Performance) reads the same
 * numbers rather than re-deriving them (TS §22 single source of truth).
 */
export interface WeeklyMetrics {
  /** `|ExpectedDays(m, w)|` — 0–6 after prorating/truncation (E-06). */
  expectedDays: number;
  missedDailyReports: number;
  missedDailyMemorization: number;
  missedDailyRevision: number;
  missed50Repetitions: number;
  missedSingleSession: number;
  /** `|EffectiveDays(m, w)|` — expected days minus `ABSENT_EXCUSED` (BR-24). */
  effectiveDays: number;
  /** `|MemorizationExpectedDays(m, w)|` — effective days minus `REVISION` (BR-27/28a). */
  memorizationExpectedDays: number;
  /** `NORMAL` days bearing a memorisation range (§18.2 `missed_50_repetitions` denominator). */
  memorizationDays: number;
  /** The VO-09 tally over `ExpectedDays(m, w)` (APIS §10.9 `day_breakdown`). */
  dayBreakdown: DayBreakdown;
  /** The AbsenceReason tally over the same days (APIS §10.9 `absence_breakdown`). */
  absenceBreakdown: AbsenceBreakdown;
}

/**
 * One classified expected day — the tuple every metric below aggregates.
 * `report` is null exactly when `classification === 'NO_REPORT'`.
 */
interface ClassifiedDay {
  date: string;
  classification: DayClassification;
  report: DailyReportDaySnapshot | null;
}

/**
 * `ExpectedDays(m, w)` (SAS §18.1, BR-45, DEC-A03):
 *   { d ∈ [w.week_start, w.week_end] : d ≠ w.week_end AND d ∈ EffectiveWindow(m) }
 * The recitation day is excluded; the window prorates (FR-WR-09) and
 * truncates (FR-WR-10). At most 6 dates.
 */
function expectedDays(week: ReportingWeek, window: EffectiveWindow): string[] {
  const days: string[] = [];
  for (let d = week.weekStart; d < week.weekEnd; d = addDays(d, 1)) {
    if (d >= window.from && d <= window.to) {
      days.push(d);
    }
  }
  return days;
}

/** Count of the expected days carrying one VO-09 classification. */
function countOf(
  days: readonly ClassifiedDay[],
  classification: DayClassification,
): number {
  return days.filter((d) => d.classification === classification).length;
}

/** Count of the expected days filed `Absent` with one AbsenceReason (VR-19). */
function countAbsencesFor(
  days: readonly ClassifiedDay[],
  reason: 'Sick' | 'Studying' | 'Other',
): number {
  return days.filter(
    (d) => d.report?.type === 'Absent' && d.report.absenceReason === reason,
  ).length;
}

/**
 * `WeeklyMetricsCalculator` (TS §22): the six calculations of SAS §18.2
 * as pure aggregations over `classify()` results across the week's
 * expected days. Called identically for the live current-week view
 * (API-033, never stored) and for the row created on the recitation day
 * (DBD §14) — no second implementation exists (DMS §21.3).
 *
 * Framework-free, no I/O (TS §9, SA §12 "Domain service, pure").
 */
export function computeWeeklyMetrics(input: WeeklyMetricsInput): WeeklyMetrics {
  const byDate = new Map<string, DailyReportDaySnapshot>();
  for (const report of input.reports) {
    byDate.set(report.reportDate, report);
  }

  const days: ClassifiedDay[] = expectedDays(
    input.week,
    input.effectiveWindow,
  ).map((date) => {
    const report = byDate.get(date) ?? null;
    return { date, classification: classifyDay(report), report };
  });

  // EffectiveDays: excused absences leave every calculation (BR-24).
  const effective = days.filter((d) => d.classification !== 'ABSENT_EXCUSED');
  // MemorizationExpectedDays: a Revision-type day excuses memorisation (BR-27, BR-28a).
  const memorizationExpected = effective.filter(
    (d) => d.classification !== 'REVISION',
  );
  // Days on which memorisation actually occurred (§18.2 quality-rate denominator).
  const memorizationDays = effective.filter(
    (d) => d.classification === 'NORMAL' && d.report?.hasMemoRange === true,
  );

  const isMissOrOther = (d: ClassifiedDay): boolean =>
    d.classification === 'NO_REPORT' || d.classification === 'ABSENT_OTHER';

  return {
    expectedDays: days.length,
    // count( d ∈ EffectiveDays : classify(d) = NO_REPORT ) — BR-23, BR-24.
    missedDailyReports: effective.filter(
      (d) => d.classification === 'NO_REPORT',
    ).length,
    // count( d ∈ MemorizationExpectedDays : NO_REPORT ∨ ABSENT_OTHER ∨
    //        (NORMAL ∧ no_memorization_today) ) — BR-25, BR-48, DEC-B08.
    missedDailyMemorization: memorizationExpected.filter(
      (d) =>
        isMissOrOther(d) ||
        (d.classification === 'NORMAL' &&
          d.report?.noMemorizationToday === true),
    ).length,
    // count( d ∈ EffectiveDays : NO_REPORT ∨ ABSENT_OTHER ∨
    //        (NORMAL ∧ no_revision_today) ) — BR-47, DEC-A08: a REVISION day
    // stays in the denominator and is never a miss.
    missedDailyRevision: effective.filter(
      (d) =>
        isMissOrOther(d) ||
        (d.classification === 'NORMAL' && d.report?.noRevisionToday === true),
    ).length,
    // count( NORMAL ∧ memo_range present ∧ completed_50_repetitions = false ) — BR-26.
    missed50Repetitions: memorizationDays.filter(
      (d) => d.report?.completed50Repetitions === false,
    ).length,
    // count( NORMAL ∧ completed_50_repetitions = true ∧
    //        repetitions_in_single_session = false ) — ISS-13 reading, VR-18.
    missedSingleSession: memorizationDays.filter(
      (d) =>
        d.report?.completed50Repetitions === true &&
        d.report.repetitionsInSingleSession === false,
    ).length,
    effectiveDays: effective.length,
    memorizationExpectedDays: memorizationExpected.length,
    memorizationDays: memorizationDays.length,
    // VO-09 tallied over ExpectedDays — every classification, excused
    // included, so the five counts sum to `expectedDays` (APIS §10.9).
    dayBreakdown: {
      normal: countOf(days, 'NORMAL'),
      revision: countOf(days, 'REVISION'),
      absentExcused: countOf(days, 'ABSENT_EXCUSED'),
      absentOther: countOf(days, 'ABSENT_OTHER'),
      noReport: countOf(days, 'NO_REPORT'),
    },
    // The same days split by VR-19's reason (UC-07 step 4's "absence-reason
    // breakdown"): Sick + Studying is exactly ABSENT_EXCUSED (BR-24) and
    // Other is exactly ABSENT_OTHER (BR-25).
    absenceBreakdown: {
      sick: countAbsencesFor(days, 'Sick'),
      studying: countAbsencesFor(days, 'Studying'),
      other: countAbsencesFor(days, 'Other'),
    },
  };
}
