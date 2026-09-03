import type { SurahOrdinalInfo } from './ayah-position';
import { AyahRange } from './ayah-range';
import { planCoverageReconciliation } from './coverage-reconciliation';
import { CoverageSet } from './coverage-set';

/** Two surahs of ten ayat each — ordinals 1..20. */
const SURAHS: SurahOrdinalInfo[] = [
  { number: 1, ayahCount: 10, ordinalOffset: 0 },
  { number: 2, ayahCount: 10, ordinalOffset: 10 },
];

function range(from: number, to: number): AyahRange {
  return AyahRange.fromOrdinals(from, to, SURAHS);
}

/** One "hizb" spanning ordinals 1..10, for the BR-51 recount. */
const HIZB_RANGES = [range(1, 10)];

describe('ADR-029 coverage reconciliation', () => {
  it('reports consistency and plans nothing when coverage already reflects every report', () => {
    const plan = planCoverageReconciliation({
      stored: CoverageSet.fromRanges([range(1, 10)]),
      storedAhzabCompleted: 1,
      submittedRanges: [range(1, 5), range(6, 10)],
      hizbRanges: HIZB_RANGES,
    });

    expect(plan.consistent).toBe(true);
    expect(plan.steps).toHaveLength(0);
  });

  it('plans the lost merge when a post-commit coverage update failed', () => {
    // The report for 6..10 committed; its coverage update did not.
    const plan = planCoverageReconciliation({
      stored: CoverageSet.fromRanges([range(1, 5)]),
      storedAhzabCompleted: 0,
      submittedRanges: [range(1, 5), range(6, 10)],
      hizbRanges: HIZB_RANGES,
    });

    expect(plan.consistent).toBe(false);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].submitted.startOrdinal).toBe(6);
    // The merged interval absorbs the adjacent stored one (VO-07).
    expect(plan.steps[0].merged.startOrdinal).toBe(1);
    expect(plan.steps[0].merged.endOrdinal).toBe(10);
    expect(plan.ahzabCompleted).toBe(1);
    expect(plan.lastMemorizedOrdinal).toBe(10);
  });

  it('never discards the DS-01 acceptance seed, which no report accounts for', () => {
    // Seeded coverage 1..10 with no daily report behind it at all.
    const plan = planCoverageReconciliation({
      stored: CoverageSet.fromRanges([range(1, 10)]),
      storedAhzabCompleted: 1,
      submittedRanges: [],
      hizbRanges: HIZB_RANGES,
    });

    expect(plan.consistent).toBe(true);
    expect(plan.reconciled.intervals).toHaveLength(1);
    expect(plan.reconciled.coveredAyahCount).toBe(10);
    expect(plan.lastMemorizedOrdinal).toBeNull();
  });

  it('recounts ahzab_completed even when every range is already covered', () => {
    const plan = planCoverageReconciliation({
      stored: CoverageSet.fromRanges([range(1, 10)]),
      storedAhzabCompleted: 0, // drifted low
      submittedRanges: [range(1, 10)],
      hizbRanges: HIZB_RANGES,
    });

    expect(plan.consistent).toBe(false);
    expect(plan.steps).toHaveLength(0);
    expect(plan.ahzabCompleted).toBe(1);
  });

  it('is idempotent — the plan of a reconciled set is empty', () => {
    const first = planCoverageReconciliation({
      stored: CoverageSet.fromRanges([range(1, 5)]),
      storedAhzabCompleted: 0,
      submittedRanges: [range(1, 5), range(6, 10), range(12, 15)],
      hizbRanges: HIZB_RANGES,
    });

    const second = planCoverageReconciliation({
      stored: first.reconciled,
      storedAhzabCompleted: first.ahzabCompleted,
      submittedRanges: [range(1, 5), range(6, 10), range(12, 15)],
      hizbRanges: HIZB_RANGES,
    });

    expect(second.consistent).toBe(true);
    expect(second.steps).toHaveLength(0);
  });

  it('takes last_memorized_ordinal from the newest submission (DEC-D02)', () => {
    // Out-of-order memorisation: the newest report is an EARLIER range.
    const plan = planCoverageReconciliation({
      stored: CoverageSet.fromRanges([]),
      storedAhzabCompleted: 0,
      submittedRanges: [range(12, 15), range(1, 5)],
      hizbRanges: HIZB_RANGES,
    });

    expect(plan.lastMemorizedOrdinal).toBe(5);
  });
});
