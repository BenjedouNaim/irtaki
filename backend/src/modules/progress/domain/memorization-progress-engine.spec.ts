import { CoverageInterval, CoverageSet } from './coverage-set';
import { CoverageShrinkError } from './coverage.errors';
import {
  HizbOrdinalRange,
  MemorizationProgressEngine,
} from './memorization-progress-engine';

/**
 * Fixture hizb boundaries in a tiny synthetic ordinal space: five ahzab of
 * 100 ayat each (T = 500). The algorithm is riwaya-agnostic (TS §23), so the
 * real 60-hizb / 6214-ayah dataset is only exercised by the integration test.
 */
const HIZB_FIXTURE: HizbOrdinalRange[] = [
  { hizbNumber: 1, startOrdinal: 1, endOrdinal: 100 },
  { hizbNumber: 2, startOrdinal: 101, endOrdinal: 200 },
  { hizbNumber: 3, startOrdinal: 201, endOrdinal: 300 },
  { hizbNumber: 4, startOrdinal: 301, endOrdinal: 400 },
  { hizbNumber: 5, startOrdinal: 401, endOrdinal: 500 },
];
const TOTAL_AYAHS = 500;

function applyAll(
  start: CoverageSet,
  submissions: CoverageInterval[],
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
        { startOrdinal: 1, endOrdinal: 40 },
        { startOrdinal: 41, endOrdinal: 100 },
        { startOrdinal: 101, endOrdinal: 150 },
      ]);

      expect(coverage.intervals).toEqual([
        { startOrdinal: 1, endOrdinal: 150 },
      ]);
      expect(ahzabCompleted).toBe(1);
      expect(last).toBe(150);
    });

    it('backward: consecutive ranges extend leftward into one block', () => {
      const { coverage, ahzabCompleted, last } = applyAll(CoverageSet.empty(), [
        { startOrdinal: 451, endOrdinal: 500 },
        { startOrdinal: 401, endOrdinal: 450 },
        { startOrdinal: 351, endOrdinal: 400 },
      ]);

      expect(coverage.intervals).toEqual([
        { startOrdinal: 351, endOrdinal: 500 },
      ]);
      expect(ahzabCompleted).toBe(1);
      // Activity pointer follows the most recent submission, not the frontier.
      expect(last).toBe(400);
    });

    it('middle start, both directions: direction is never stored', () => {
      const { coverage, ahzabCompleted } = applyAll(CoverageSet.empty(), [
        { startOrdinal: 250, endOrdinal: 260 },
        { startOrdinal: 261, endOrdinal: 300 },
        { startOrdinal: 201, endOrdinal: 249 },
      ]);

      expect(coverage.intervals).toEqual([
        { startOrdinal: 201, endOrdinal: 300 },
      ]);
      expect(ahzabCompleted).toBe(1);
    });

    it('skip and resume: a second disjoint interval simply appears, no error', () => {
      const { coverage, ahzabCompleted } = applyAll(CoverageSet.empty(), [
        { startOrdinal: 1, endOrdinal: 50 },
        { startOrdinal: 301, endOrdinal: 400 },
      ]);

      expect(coverage.intervals).toEqual([
        { startOrdinal: 1, endOrdinal: 50 },
        { startOrdinal: 301, endOrdinal: 400 },
      ]);
      expect(ahzabCompleted).toBe(1);
    });

    it('overlapping range: the union absorbs it, nothing is double-counted', () => {
      const { coverage, ahzabCompleted } = applyAll(CoverageSet.empty(), [
        { startOrdinal: 1, endOrdinal: 60 },
        { startOrdinal: 40, endOrdinal: 100 },
        { startOrdinal: 10, endOrdinal: 20 },
      ]);

      expect(coverage.intervals).toEqual([
        { startOrdinal: 1, endOrdinal: 100 },
      ]);
      expect(coverage.coveredAyahCount).toBe(100);
      expect(ahzabCompleted).toBe(1);
    });

    it('adjacent range: touching intervals merge into one', () => {
      const seeded = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 100 },
        { startOrdinal: 201, endOrdinal: 300 },
      ]);
      const result = MemorizationProgressEngine.merge(
        seeded,
        { startOrdinal: 101, endOrdinal: 200 },
        HIZB_FIXTURE,
      );

      expect(result.coverage.intervals).toEqual([
        { startOrdinal: 1, endOrdinal: 300 },
      ]);
      expect(result.merged).toEqual({ startOrdinal: 1, endOrdinal: 300 });
      expect(result.absorbed).toEqual([
        { startOrdinal: 1, endOrdinal: 100 },
        { startOrdinal: 201, endOrdinal: 300 },
      ]);
      expect(result.ahzabCompleted).toBe(3);
    });
  });

  describe('INV-18 — coverage never shrinks', () => {
    it('a fully-covered resubmission leaves coverage unchanged', () => {
      const seeded = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 200 },
      ]);
      const result = MemorizationProgressEngine.merge(
        seeded,
        { startOrdinal: 50, endOrdinal: 60 },
        HIZB_FIXTURE,
      );

      expect(result.coverage.equals(seeded)).toBe(true);
      expect(result.ahzabCompleted).toBe(2);
      expect(result.lastMemorizedOrdinal).toBe(60);
    });

    it('assertNeverShrinks throws when the after-state loses coverage', () => {
      const before = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 100 },
      ]);
      const after = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 50 },
      ]);
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
      const coverage = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 100 },
        { startOrdinal: 101, endOrdinal: 199 },
        { startOrdinal: 301, endOrdinal: 500 },
      ]);
      expect(
        MemorizationProgressEngine.computeAhzabCompleted(
          coverage,
          HIZB_FIXTURE,
        ),
      ).toBe(3);
    });

    it('computes coverage_percent as covered / T × 100 rounded to 2 decimals', () => {
      const coverage = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 3 },
      ]);
      expect(
        MemorizationProgressEngine.computeCoveragePercent(
          coverage,
          TOTAL_AYAHS,
        ),
      ).toBe(0.6);
      expect(
        MemorizationProgressEngine.computeCoveragePercent(
          CoverageSet.fromIntervals([{ startOrdinal: 1, endOrdinal: 1 }]),
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
        CoverageSet.fromIntervals([{ startOrdinal: 400, endOrdinal: 500 }]),
        { startOrdinal: 10, endOrdinal: 20 },
        HIZB_FIXTURE,
      );
      expect(result.lastMemorizedOrdinal).toBe(20);
    });
  });
});
