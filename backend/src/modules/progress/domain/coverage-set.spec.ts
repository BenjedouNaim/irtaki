import { CoverageSet } from './coverage-set';
import { InvalidCoverageIntervalError } from './coverage.errors';

describe('CoverageSet (VO-07)', () => {
  describe('fromIntervals', () => {
    it('builds an empty set', () => {
      const set = CoverageSet.fromIntervals([]);
      expect(set.isEmpty).toBe(true);
      expect(set.intervals).toEqual([]);
      expect(set.coveredAyahCount).toBe(0);
    });

    it('sorts intervals ascending by start ordinal', () => {
      const set = CoverageSet.fromIntervals([
        { startOrdinal: 50, endOrdinal: 60 },
        { startOrdinal: 1, endOrdinal: 10 },
      ]);
      expect(set.intervals).toEqual([
        { startOrdinal: 1, endOrdinal: 10 },
        { startOrdinal: 50, endOrdinal: 60 },
      ]);
    });

    it('normalises overlapping and adjacent input into disjoint, non-adjacent intervals', () => {
      const set = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 10 },
        { startOrdinal: 11, endOrdinal: 20 },
        { startOrdinal: 15, endOrdinal: 25 },
        { startOrdinal: 40, endOrdinal: 45 },
      ]);
      expect(set.intervals).toEqual([
        { startOrdinal: 1, endOrdinal: 25 },
        { startOrdinal: 40, endOrdinal: 45 },
      ]);
    });

    it('rejects an interval whose end precedes its start (BR-52)', () => {
      expect(() =>
        CoverageSet.fromIntervals([{ startOrdinal: 10, endOrdinal: 9 }]),
      ).toThrow(InvalidCoverageIntervalError);
    });

    it('rejects non-positive or non-integer ordinals', () => {
      expect(() =>
        CoverageSet.fromIntervals([{ startOrdinal: 0, endOrdinal: 5 }]),
      ).toThrow(InvalidCoverageIntervalError);
      expect(() =>
        CoverageSet.fromIntervals([{ startOrdinal: 1.5, endOrdinal: 5 }]),
      ).toThrow(InvalidCoverageIntervalError);
    });
  });

  describe('insert', () => {
    it('adds a disjoint interval without touching existing ones', () => {
      const set = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 10 },
      ]);
      const result = set.insert({ startOrdinal: 20, endOrdinal: 30 });

      expect(result.coverage.intervals).toEqual([
        { startOrdinal: 1, endOrdinal: 10 },
        { startOrdinal: 20, endOrdinal: 30 },
      ]);
      expect(result.merged).toEqual({ startOrdinal: 20, endOrdinal: 30 });
      expect(result.absorbed).toEqual([]);
    });

    it('does not mutate the original set', () => {
      const set = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 10 },
      ]);
      set.insert({ startOrdinal: 11, endOrdinal: 12 });
      expect(set.intervals).toEqual([{ startOrdinal: 1, endOrdinal: 10 }]);
    });

    it('absorbs every overlapping and adjacent neighbour into one merged interval', () => {
      const set = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 5 },
        { startOrdinal: 10, endOrdinal: 12 },
        { startOrdinal: 20, endOrdinal: 25 },
        { startOrdinal: 40, endOrdinal: 50 },
      ]);
      const result = set.insert({ startOrdinal: 6, endOrdinal: 19 });

      expect(result.merged).toEqual({ startOrdinal: 1, endOrdinal: 25 });
      expect(result.absorbed).toEqual([
        { startOrdinal: 1, endOrdinal: 5 },
        { startOrdinal: 10, endOrdinal: 12 },
        { startOrdinal: 20, endOrdinal: 25 },
      ]);
      expect(result.coverage.intervals).toEqual([
        { startOrdinal: 1, endOrdinal: 25 },
        { startOrdinal: 40, endOrdinal: 50 },
      ]);
    });

    it('is a no-op in content when the range is already fully covered', () => {
      const set = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 100 },
      ]);
      const result = set.insert({ startOrdinal: 20, endOrdinal: 30 });

      expect(result.coverage.equals(set)).toBe(true);
      expect(result.merged).toEqual({ startOrdinal: 1, endOrdinal: 100 });
      expect(result.absorbed).toEqual([{ startOrdinal: 1, endOrdinal: 100 }]);
    });

    it('rejects an invalid range', () => {
      const set = CoverageSet.empty();
      expect(() => set.insert({ startOrdinal: 5, endOrdinal: 4 })).toThrow(
        InvalidCoverageIntervalError,
      );
    });
  });

  describe('contains / covers', () => {
    const set = CoverageSet.fromIntervals([
      { startOrdinal: 1, endOrdinal: 10 },
      { startOrdinal: 20, endOrdinal: 30 },
    ]);

    it('is true only when the whole range sits inside one interval', () => {
      expect(set.contains({ startOrdinal: 1, endOrdinal: 10 })).toBe(true);
      expect(set.contains({ startOrdinal: 22, endOrdinal: 25 })).toBe(true);
      expect(set.contains({ startOrdinal: 5, endOrdinal: 22 })).toBe(false);
      expect(set.contains({ startOrdinal: 11, endOrdinal: 11 })).toBe(false);
      expect(set.contains({ startOrdinal: 31, endOrdinal: 40 })).toBe(false);
    });

    it('covers a subset and not a superset', () => {
      const subset = CoverageSet.fromIntervals([
        { startOrdinal: 2, endOrdinal: 3 },
        { startOrdinal: 20, endOrdinal: 30 },
      ]);
      const superset = CoverageSet.fromIntervals([
        { startOrdinal: 1, endOrdinal: 31 },
      ]);
      expect(set.covers(subset)).toBe(true);
      expect(set.covers(superset)).toBe(false);
      expect(set.covers(CoverageSet.empty())).toBe(true);
    });
  });

  it('counts covered ayat as the sum of closed-interval lengths', () => {
    const set = CoverageSet.fromIntervals([
      { startOrdinal: 1, endOrdinal: 10 },
      { startOrdinal: 20, endOrdinal: 20 },
    ]);
    expect(set.coveredAyahCount).toBe(11);
  });
});
