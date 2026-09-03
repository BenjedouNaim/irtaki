import type { EffectiveWindow } from '../../reports/domain/weekly-metrics-calculator';
import { countExpectedDaysSinceLastReport } from './expected-day-counting';

/**
 * The at-risk threshold — "3 consecutive **expected** days with no report"
 * (DEC-B05, SAS §18.4, FR-PERF-08). A specified business value, not a
 * tunable constant (AGENTS §13).
 */
export const AT_RISK_CONSECUTIVE_EXPECTED_DAYS = 3;

export interface AtRiskEvaluationInput {
  /**
   * `YYYY-MM-DD` of the membership's newest LIVE daily report, whatever its
   * type; null when the membership has never reported. Every DailyReport
   * type is a report: `Absent/Sick` and `Absent/Studying` classify as
   * `ABSENT_EXCUSED` and `Absent/Other` as `ABSENT_OTHER`, and SAS §18.4
   * has **both** break the streak, so the predicate needs no more than the
   * date of the newest one.
   */
  lastReportDate: string | null;
  /** `EffectiveWindow(m)` — SAS §18.1, resolved in the STUDENT's timezone. */
  window: EffectiveWindow;
  /** `groups.recitation_day`, ISO day-of-week 1..7 — BR-15's week anchor. */
  recitationDay: number;
}

export interface AtRiskEvaluation {
  /** The DEC-B05 predicate for this membership. */
  atRisk: boolean;
  /**
   * Expected days elapsed since the newest report — API-040's
   * `days_since_last_report` and API-037/039's field of the same name, from
   * the one counting function (TS §24, closing CON-07).
   */
  daysSinceLastReport: number;
}

/**
 * DS-04 `AtRiskDetectionService` (DMS §21 — "evaluates the
 * 3-consecutive-expected-days predicate, **read-time only**"; SAS §18.4,
 * DEC-B05, FR-PERF-08):
 *
 * ```
 * AtRisk(m) ⟺ the last 3 expected days within EffectiveWindow(m), evaluated
 *              backwards from today, all classify as NO_REPORT
 *
 *   · Recitation days are skipped, not counted
 *   · ABSENT_EXCUSED counts as REPORTED and therefore BREAKS the streak
 *   · ABSENT_OTHER   counts as REPORTED and therefore BREAKS the streak
 *   · Terminated memberships are excluded entirely (FR-PERF-10, DEC-C04)
 * ```
 *
 * The flag is never stored — it "depends on today's date, so a stored value
 * would need constant invalidation for no benefit" (DMS §22, DBD §68,
 * SAS §18.7). Pure and framework-free (TS §9): no Nest, no TypeORM, no I/O.
 *
 * **Why the newest report date decides the whole predicate.** The three
 * bullets above collapse into one question — "does a live report exist on
 * this expected day?" — because `classify(m, d) = NO_REPORT` holds exactly
 * when no live E-05 row is dated `d` (`classifyDay`, BR-23), and every
 * other classification requires a row. A report is therefore the ONLY thing
 * that breaks a streak, and no report can be dated after the newest one. So:
 *
 * ```
 * the last 3 expected days are all NO_REPORT
 *   ⟺ at least 3 expected days of the window lie strictly after the newest
 *      live report (or after the window's start, when there is none)
 *   ⟺ countExpectedDaysSinceLastReport(...) ≥ 3
 * ```
 *
 * A recitation day is skipped on both sides of that equivalence: it is not
 * an expected day (BR-45, DEC-A03), it is never counted, and it can never
 * carry a report to break the streak with (VR-12 rejects a submission on
 * the recitation day with `422 RECITATION_DAY`).
 *
 * Sharing `countExpectedDaysSinceLastReport` with the individual dashboard
 * is what TS §24 requires — "the days-since-last-report figure uses the
 * SAME expected-day counting as `AtRisk`, so the two can never disagree"
 * (closing CON-07). A membership with fewer than 3 expected days behind it
 * is consequently never at risk: the window does not hold the three days
 * the predicate quantifies over.
 */
export class AtRiskDetectionService {
  static evaluate(input: AtRiskEvaluationInput): AtRiskEvaluation {
    const daysSinceLastReport = countExpectedDaysSinceLastReport({
      lastReportDate: input.lastReportDate,
      window: input.window,
      recitationDay: input.recitationDay,
    });

    return {
      daysSinceLastReport,
      atRisk: daysSinceLastReport >= AT_RISK_CONSECUTIVE_EXPECTED_DAYS,
    };
  }
}

/** One row of API-040's list — the DS-04 result for a single membership. */
export interface AtRiskStudent {
  membershipId: string;
  /** `users.full_name`; nullable exactly as the column is (never `""`). */
  fullName: string | null;
  /** Expected days since the last report — always ≥ 3 on this list. */
  daysSinceLastReport: number;
}
