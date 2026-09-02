import { SurahOrdinalInfo } from './ayah-position';
import { AyahRange } from './ayah-range';
import { CoverageSet } from './coverage-set';
import { CoverageShrinkError } from './coverage.errors';
import { MemorizationProgressEngine } from './memorization-progress-engine';

/**
 * Fixture in a tiny synthetic ordinal space: five surahs of 100 ayat and five
 * ahzab of 100 ayat each (T = 500). The algorithm is riwaya-agnostic (TS §23),
 * so the real 60-hizb / 6214-ayah dataset is only exercised by the
 * integration test.
 */
const SURAHS: SurahOrdinalInfo[] = Array.from({ length: 5 }, (_, i) => ({
  number: i + 1,
  ayahCount: 100,
  ordinalOffset: i * 100,
}));
const TOTAL_AYAHS = 500;

const r = (lo: number, hi: number): AyahRange =>
  AyahRange.fromOrdinals(lo, hi, SURAHS);

const HIZB_FIXTURE: AyahRange[] = [
  r(1, 100),
  r(101, 200),
  r(201, 300),
  r(301, 400),
  r(401, 500),
];

const ords = (ranges: readonly AyahRange[]): Array<[number, number]> =>
  ranges.map((i) => [i.startOrdinal, i.endOrdinal]);

function applyAll(
  start: CoverageSet,
  submissions: AyahRange[],
): { coverage: CoverageSet; ahzabCompleted: number; last: number } {
  let coverage = start;
  let ahzabCompleted = 0;
  let last = 0;
  for (const range of submissions) {
    const before = coverage;
    const result = MemorizationProgressEngine.merge(
      coverage,
      range,
      HIZB_FIXTURE,
    );
    // INV-18 at every step: nothing previously covered is ever lost.
    expect(result.coverage.covers(before)).toBe(true);
    expect(result.coverage.coveredAyahCount).toBeGreaterThanOrEqual(
      before.coveredAyahCount,
    );
    coverage = result.coverage;
    ahzabCompleted = result.ahzabCompleted;
    last = result.lastMemorizedOrdinal;
  }
  return { coverage, ahzabCompleted, last };
}

describe('MemorizationProgressEngine (DS-05)', () => {
  describe('ADR-008 memorisation patterns', () => {
    it('forward: consecutive ranges extend rightward into one block', () => {
      const { coverage, ahzabCompleted, last } = applyAll(CoverageSet.empty(), [
        r(1, 40),
        r(41, 100),
        r(101, 150),
      ]);

      expect(ords(coverage.intervals)).toEqual([[1, 150]]);
      expect(ahzabCompleted).toBe(1);
      expect(last).toBe(150);
    });

    it('backward: consecutive ranges extend leftward into one block', () => {
      const { coverage, ahzabCompleted, last } = applyAll(CoverageSet.empty(), [
        r(451, 500),
        r(401, 450),
        r(351, 400),
      ]);

      expect(ords(coverage.intervals)).toEqual([[351, 500]]);
      expect(ahzabCompleted).toBe(1);
      // Activity pointer follows the most recent submission, not the frontier.
      expect(last).toBe(400);
    });

    it('middle start, both directions: direction is never stored', () => {
      const { coverage, ahzabCompleted } = applyAll(CoverageSet.empty(), [
        r(250, 260),
        r(261, 300),
        r(201, 249),
      ]);

      expect(ords(coverage.intervals)).toEqual([[201, 300]]);
      expect(ahzabCompleted).toBe(1);
    });

    it('skip and resume: a second disjoint interval simply appears, no error', () => {
      const { coverage, ahzabCompleted } = applyAll(CoverageSet.empty(), [
        r(1, 50),
        r(301, 400),
      ]);

      expect(ords(coverage.intervals)).toEqual([
        [1, 50],
        [301, 400],
      ]);
      expect(ahzabCompleted).toBe(1);
    });

    it('overlapping range: the union absorbs it, nothing is double-counted', () => {
      const { coverage, ahzabCompleted } = applyAll(CoverageSet.empty(), [
        r(1, 60),
        r(40, 100),
        r(10, 20),
      ]);

      expect(ords(coverage.intervals)).toEqual([[1, 100]]);
      expect(coverage.coveredAyahCount).toBe(100);
      expect(ahzabCompleted).toBe(1);
    });

    it('adjacent range: touching intervals merge into one', () => {
      const seeded = CoverageSet.fromRanges([r(1, 100), r(201, 300)]);
      const result = MemorizationProgressEngine.merge(
        seeded,
        r(101, 200),
        HIZB_FIXTURE,
      );

      expect(ords(result.coverage.intervals)).toEqual([[1, 300]]);
      expect(result.merged.equals(r(1, 300))).toBe(true);
      expect(ords(result.absorbed)).toEqual([
        [1, 100],
        [201, 300],
      ]);
      expect(result.ahzabCompleted).toBe(3);
    });
  });

  describe('INV-18 — coverage never shrinks', () => {
    it('a fully-covered resubmission leaves coverage unchanged', () => {
      const seeded = CoverageSet.fromRanges([r(1, 200)]);
      const result = MemorizationProgressEngine.merge(
        seeded,
        r(50, 60),
        HIZB_FIXTURE,
      );

      expect(result.coverage.equals(seeded)).toBe(true);
      expect(result.ahzabCompleted).toBe(2);
      expect(result.lastMemorizedOrdinal).toBe(60);
    });

    it('assertNeverShrinks throws when the after-state loses coverage', () => {
      const before = CoverageSet.fromRanges([r(1, 100)]);
      const after = CoverageSet.fromRanges([r(1, 50)]);
      expect(() =>
        MemorizationProgressEngine.assertNeverShrinks(before, after),
      ).toThrow(CoverageShrinkError);
      expect(() =>
        MemorizationProgressEngine.assertNeverShrinks(after, before),
      ).not.toThrow();
    });
  });

  describe('derived figures (SAS §17.6)', () => {
    it('counts a hizb only when its entire span is covered (BR-51)', () => {
      const coverage = CoverageSet.fromRanges([
        r(1, 100),
        r(101, 199),
        r(301, 500),
      ]);
      expect(
        MemorizationProgressEngine.computeAhzabCompleted(
          coverage,
          HIZB_FIXTURE,
        ),
      ).toBe(3);
    });

    it('computes coverage_percent as covered / T × 100 rounded to 2 decimals', () => {
      const coverage = CoverageSet.fromRanges([r(1, 3)]);
      expect(
        MemorizationProgressEngine.computeCoveragePercent(
          coverage,
          TOTAL_AYAHS,
        ),
      ).toBe(0.6);
      expect(
        MemorizationProgressEngine.computeCoveragePercent(
          CoverageSet.fromRanges([r(1, 1)]),
          6214,
        ),
      ).toBe(0.02);
      expect(
        MemorizationProgressEngine.computeCoveragePercent(
          CoverageSet.empty(),
          TOTAL_AYAHS,
        ),
      ).toBe(0);
    });

    it('records the end of the most recent submission as the activity pointer', () => {
      const result = MemorizationProgressEngine.merge(
        CoverageSet.fromRanges([r(400, 500)]),
        r(10, 20),
        HIZB_FIXTURE,
      );
      expect(result.lastMemorizedOrdinal).toBe(20);
    });
  });
});
