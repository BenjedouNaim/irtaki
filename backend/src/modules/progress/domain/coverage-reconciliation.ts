import { AyahRange } from './ayah-range';
import { CoverageSet } from './coverage-set';
import { MemorizationProgressEngine } from './memorization-progress-engine';

export interface CoverageReconciliationInput {
  /** The materialised `memorization_coverage` state, as stored today. */
  stored: CoverageSet;
  storedAhzabCompleted: number;
  /**
   * Every memorisation range the membership's live `daily_reports` carry,
   * OLDEST FIRST — the primary record ADR-029 recomputes coverage from.
   */
  submittedRanges: readonly AyahRange[];
  /** `hizb_boundaries` (DBT-12) as AyahRanges, for BR-51's count. */
  hizbRanges: readonly AyahRange[];
}

/**
 * One lost DS-05 merge, in the shape `ICoverageRepository.applyMerge`
 * persists: the interval that now covers the submitted range, having
 * absorbed every stored interval it touches. Identical to what
 * `UpdateCoverageUseCase` would have written had the post-commit update
 * not failed.
 */
export interface CoverageReconciliationStep {
  submitted: AyahRange;
  merged: AyahRange;
}

export interface CoverageReconciliationPlan {
  /** True when the stored coverage already reflects every report. */
  consistent: boolean;
  /**
   * The merges that were lost when a post-commit coverage update failed
   * (ADR-026's second transaction), oldest first.
   */
  steps: CoverageReconciliationStep[];
  /** Coverage as it should be once the missing ranges are re-applied. */
  reconciled: CoverageSet;
  /** BR-51 recount over `reconciled`. */
  ahzabCompleted: number;
  /**
   * DEC-D02 `last_memorized_ordinal`: the end position of the most recent
   * submission. Null when the membership has never submitted a range —
   * the seeded value, which this job must not overwrite.
   */
  lastMemorizedOrdinal: number | null;
}

/**
 * ADR-029's recomputation, as a pure function (TS §9).
 *
 * "A nightly job recomputes coverage from `daily_reports` and corrects
 * `memorization_coverage`" — because Daily Report submission and its
 * coverage update are deliberately two transactions (ADR-026/TS §19), so a
 * failure of the second leaves the report safely persisted while coverage
 * silently drifts.
 *
 * The recomputation is a re-application, not a rebuild: coverage may never
 * shrink (INV-18), and the DS-01 acceptance seed (F-ENR-05) is coverage
 * that no daily report will ever account for, so rebuilding purely from
 * `daily_reports` would delete it. Re-applying every submitted range to
 * what is stored converges on the same answer as an unbroken sequence of
 * DS-05 merges, and is idempotent: a range already covered contributes
 * nothing.
 */
export function planCoverageReconciliation(
  input: CoverageReconciliationInput,
): CoverageReconciliationPlan {
  let coverage = input.stored;
  const steps: CoverageReconciliationStep[] = [];

  for (const range of input.submittedRanges) {
    if (coverage.contains(range)) {
      continue;
    }
    const result = coverage.insert(range);
    steps.push({ submitted: range, merged: result.merged });
    coverage = result.coverage;
  }

  const ahzabCompleted = MemorizationProgressEngine.computeAhzabCompleted(
    coverage,
    input.hizbRanges,
  );
  const newest = input.submittedRanges.at(-1);

  return {
    consistent:
      steps.length === 0 && ahzabCompleted === input.storedAhzabCompleted,
    steps,
    reconciled: coverage,
    ahzabCompleted,
    lastMemorizedOrdinal: newest === undefined ? null : newest.endOrdinal,
  };
}
