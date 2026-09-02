import { AyahRange } from './ayah-range';
import { CoverageSet } from './coverage-set';
import { CoverageShrinkError } from './coverage.errors';

export interface CoverageMergeResult {
  /** The updated coverage (INV-18: a superset of the input coverage). */
  coverage: CoverageSet;
  /** The range now covering the submitted one (see CoverageSet.insert). */
  merged: AyahRange;
  /** Prior ranges absorbed into `merged`. */
  absorbed: AyahRange[];
  /** BR-51 / FR-PROG-02: count of ahzab whose full span lies in coverage. */
  ahzabCompleted: number;
  /**
   * DEC-D02: end position of the most recent submission. An activity pointer,
   * never "progress" — non-monotonic by design.
   */
  lastMemorizedOrdinal: number;
}

/**
 * DS-05 MemorizationProgressEngine (DMS §16, SAS §17.6, ADR-008).
 *
 * Pure interval-merge algorithm: existing CoverageSet + a submitted AyahRange
 * → updated CoverageSet + recomputed `ahzab_completed`. No I/O. Handles
 * forward, backward, middle-start, skip-and-resume, overlapping and adjacent
 * memorisation uniformly, because direction is never stored (BR-50).
 *
 * Distinct from DS-01's one-time coverage seed at membership acceptance
 * (F-ENR-05) — this is the ongoing update mechanism only.
 */
export class MemorizationProgressEngine {
  static merge(
    current: CoverageSet,
    range: AyahRange,
    hizbRanges: readonly AyahRange[],
  ): CoverageMergeResult {
    const { coverage, merged, absorbed } = current.insert(range);

    MemorizationProgressEngine.assertNeverShrinks(current, coverage);

    return {
      coverage,
      merged,
      absorbed,
      ahzabCompleted: MemorizationProgressEngine.computeAhzabCompleted(
        coverage,
        hizbRanges,
      ),
      lastMemorizedOrdinal: range.endOrdinal,
    };
  }

  /**
   * SAS §17.6: |{ h ∈ 1..60 : [h.start_ordinal, h.end_ordinal] ⊆ coverage }|
   * — `hizbRanges` are the `hizb_boundaries` spans (DBT-12) as AyahRanges.
   */
  static computeAhzabCompleted(
    coverage: CoverageSet,
    hizbRanges: readonly AyahRange[],
  ): number {
    return hizbRanges.reduce(
      (count, hizb) => (coverage.contains(hizb) ? count + 1 : count),
      0,
    );
  }

  /**
   * SAS §17.6: ( Σ interval lengths ) / T × 100 — returned exactly as the
   * formula yields it; the spec defines no rounding.
   */
  static computeCoveragePercent(
    coverage: CoverageSet,
    totalAyahCount: number,
  ): number {
    if (totalAyahCount <= 0) {
      return 0;
    }
    return (coverage.coveredAyahCount / totalAyahCount) * 100;
  }

  /** INV-18 guard: every interval of `before` must survive inside `after`. */
  static assertNeverShrinks(before: CoverageSet, after: CoverageSet): void {
    if (!after.covers(before)) {
      throw new CoverageShrinkError(
        'Memorization coverage must never shrink (INV-18)',
      );
    }
  }
}
