import type {
  DayBreakdown,
  WeeklyMetrics,
} from '../../reports/domain/weekly-metrics-calculator';

/**
 * VO-06 `CommitmentScore` (DMS §8, SAS §18.3): the 0–100 consistency
 * indicator as `(submission_rate?, memorization_rate?, revision_rate?,
 * attendance_rate?, value?)`. Every component is INDEPENDENTLY nullable and
 * `value` is the mean of the defined components, or null when none is
 * defined (DEC-B04).
 *
 * Structural, re-derived per query, meaningless without the (Membership,
 * period) pair supplied at query time — it has no existence of its own and
 * is never persisted (DMS §22, DBD §68).
 */
export interface CommitmentScore {
  submissionRate: number | null;
  memorizationRate: number | null;
  revisionRate: number | null;
  attendanceRate: number | null;
  /** Mean of the defined components; null when `|defined| = 0`. */
  value: number | null;
}

/**
 * Everything DS-03 needs for ONE caller-supplied period, already resolved
 * to whole reporting weeks by the caller (SAS §18.3 quantifies its three
 * day-set denominators over "all reporting weeks w ∩ P").
 */
export interface CommitmentScoreInput {
  /**
   * `WeeklyMetrics` of every reporting week intersecting `P`, each computed
   * against `EffectiveWindow(m)` — so `Σ effectiveDays = |D_eff(P)|` and
   * `Σ memorizationExpectedDays = |D_memo(P)|` (SAS §18.1/§18.3). The same
   * numbers the six weekly metrics are built from: DS-03 reads them, it
   * never re-derives a classification (TS §22 single source of truth).
   */
  weeks: readonly WeeklyMetrics[];
  /**
   * `|W(P)|` — the "weeks elapsed" of SRS §9.4.3: the reporting weeks in
   * `P ∩ [m.started_at, today]` whose recitation day has already passed.
   * A week still running has fed nothing into attendance (DEC-A03) and its
   * answer is undetermined until student-local midnight (SAS §18.2), so it
   * is excluded rather than scored 0 (EC-44, AC-26, DEC-B04).
   */
  weekCount: number;
  /** Finalised weekly reports in `W(P)` with `attended_recitation_call = true`. */
  attendedWeeks: number;
}

/** A rate is a percentage of its denominator, or null when it has none. */
function rate(numerator: number, denominator: number): number | null {
  // DEC-B04: a zero denominator leaves the component UNDEFINED. Never 0 —
  // that would punish a legitimately sick student, contradicting BR-24.
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function sum(
  weeks: readonly WeeklyMetrics[],
  pick: (metrics: WeeklyMetrics) => number,
): number {
  return weeks.reduce((total, week) => total + pick(week), 0);
}

/**
 * DS-03 `CommitmentScoreCalculator` (DMS §21, SAS §18.3, TS §24): the pure,
 * read-time calculation of the four-component score over a caller-supplied
 * period. Never persists a result and holds no state — every call
 * recomputes from the weekly metrics it is handed.
 *
 * Framework-free (TS §9): no Nest, no TypeORM, no I/O.
 */
export class CommitmentScoreCalculator {
  /**
   * SAS §18.3's four components and their mean:
   *
   * ```
   * SubmissionRate   = days in D_eff  bearing any report        / |D_eff(P)|
   * MemorizationRate = days in D_memo with memorization         / |D_memo(P)|
   * RevisionRate     = days in D_eff  with revision recorded    / |D_eff(P)|
   * AttendanceRate   = finalised weeks in W with attended=true  / |W(P)|
   * CommitmentScore  = mean(defined components), or null
   * ```
   *
   * Each numerator is the complement of the matching weekly `missed_*`
   * metric over the same denominator (SAS §18.2), so the Progress tab and
   * the Weekly Report can never disagree.
   */
  static calculate(input: CommitmentScoreInput): CommitmentScore {
    const effectiveDays = sum(input.weeks, (w) => w.effectiveDays);
    const memorizationExpectedDays = sum(
      input.weeks,
      (w) => w.memorizationExpectedDays,
    );

    const submissionRate = rate(
      effectiveDays - sum(input.weeks, (w) => w.missedDailyReports),
      effectiveDays,
    );
    const memorizationRate = rate(
      memorizationExpectedDays -
        sum(input.weeks, (w) => w.missedDailyMemorization),
      memorizationExpectedDays,
    );
    const revisionRate = rate(
      effectiveDays - sum(input.weeks, (w) => w.missedDailyRevision),
      effectiveDays,
    );
    const attendanceRate = rate(input.attendedWeeks, input.weekCount);

    const defined = [
      submissionRate,
      memorizationRate,
      revisionRate,
      attendanceRate,
    ].filter((component): component is number => component !== null);

    return {
      submissionRate,
      memorizationRate,
      revisionRate,
      attendanceRate,
      // |defined| = 0 → null; the UI shows "not enough data" (UF §17),
      // never a fabricated 0 (DEC-B04).
      value:
        defined.length === 0
          ? null
          : defined.reduce((total, c) => total + c, 0) / defined.length,
    };
  }

  /**
   * SAS §18.3's separate quality indicator, DELIBERATELY not folded into
   * the score (§9.4.3 design intent, TS §22):
   *
   * ```
   * RepetitionQuality = days with memorization AND completed_50_repetitions
   *                   / days with memorization × 100
   * ```
   *
   * The denominator is `memorizationDays` — days on which memorisation
   * actually occurred, not all expected days (SAS §18.2). Null when zero.
   */
  static repetitionQuality(weeks: readonly WeeklyMetrics[]): number | null {
    const memorizationDays = sum(weeks, (w) => w.memorizationDays);
    return rate(
      memorizationDays - sum(weeks, (w) => w.missed50Repetitions),
      memorizationDays,
    );
  }

  /**
   * The five VO-09 counts of every expected day in the period — the
   * `day_breakdown` of API-037, summing to `Σ expectedDays` by construction.
   */
  static dayBreakdown(weeks: readonly WeeklyMetrics[]): DayBreakdown {
    return {
      normal: sum(weeks, (w) => w.dayBreakdown.normal),
      revision: sum(weeks, (w) => w.dayBreakdown.revision),
      absentExcused: sum(weeks, (w) => w.dayBreakdown.absentExcused),
      absentOther: sum(weeks, (w) => w.dayBreakdown.absentOther),
      noReport: sum(weeks, (w) => w.dayBreakdown.noReport),
    };
  }
}
