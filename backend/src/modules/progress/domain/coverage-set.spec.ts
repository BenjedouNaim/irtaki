import { SurahOrdinalInfo } from './ayah-position';
import { AyahRange } from './ayah-range';
import { CoverageSet } from './coverage-set';

/** Synthetic reference data: ten surahs of 100 ayat each (T = 1000). */
const SURAHS: SurahOrdinalInfo[] = Array.from({ length: 10 }, (_, i) => ({
  number: i + 1,
  ayahCount: 100,
  ordinalOffset: i * 100,
}));

const r = (lo: number, hi: number): AyahRange =>
  AyahRange.fromOrdinals(lo, hi, SURAHS);

/** Ordinal view of a set's intervals, for compact assertions. */
const ords = (ranges: readonly AyahRange[]): Array<[number, number]> =>
  ranges.map((i) => [i.startOrdinal, i.endOrdinal]);

describe('CoverageSet (VO-07)', () => {
  describe('fromRanges', () => {
    it('builds an empty set', () => {
      const set = CoverageSet.fromRanges([]);
      expect(set.isEmpty).toBe(true);
      expect(set.intervals).toEqual([]);
      expect(set.coveredAyahCount).toBe(0);
    });

    it('sorts ranges ascending by start ordinal', () => {
      const set = CoverageSet.fromRanges([r(50, 60), r(1, 10)]);
      expect(ords(set.intervals)).toEqual([
        [1, 10],
        [50, 60],
      ]);
    });

    it('normalises overlapping and adjacent input into disjoint, non-adjacent ranges', () => {
      const set = CoverageSet.fromRanges([
        r(1, 10),
        r(11, 20),
        r(15, 25),
        r(40, 45),
      ]);
      expect(ords(set.intervals)).toEqual([
        [1, 25],
        [40, 45],
      ]);
    });

    it('keeps the AyahRange endpoints of the ranges it merges', () => {
      const set = CoverageSet.fromRanges([r(95, 105), r(100, 110)]);
      expect(set.intervals[0].start).toMatchObject({ surah: 1, ayah: 95 });
      expect(set.intervals[0].end).toMatchObject({ surah: 2, ayah: 10 });
    });
  });

  describe('insert', () => {
    it('adds a disjoint range without touching existing ones', () => {
      const set = CoverageSet.fromRanges([r(1, 10)]);
      const result = set.insert(r(20, 30));

      expect(ords(result.coverage.intervals)).toEqual([
        [1, 10],
        [20, 30],
      ]);
      expect(result.merged.equals(r(20, 30))).toBe(true);
      expect(result.absorbed).toEqual([]);
    });

    it('does not mutate the original set', () => {
      const set = CoverageSet.fromRanges([r(1, 10)]);
      set.insert(r(11, 12));
      expect(ords(set.intervals)).toEqual([[1, 10]]);
    });

    it('absorbs every overlapping and adjacent neighbour into one merged range', () => {
      const set = CoverageSet.fromRanges([
        r(1, 5),
        r(10, 12),
        r(20, 25),
        r(40, 50),
      ]);
      const result = set.insert(r(6, 19));

      expect(result.merged.equals(r(1, 25))).toBe(true);
      expect(ords(result.absorbed)).toEqual([
        [1, 5],
        [10, 12],
        [20, 25],
      ]);
      expect(ords(result.coverage.intervals)).toEqual([
        [1, 25],
        [40, 50],
      ]);
    });

    it('is a no-op in content when the range is already fully covered', () => {
      const set = CoverageSet.fromRanges([r(1, 100)]);
      const result = set.insert(r(20, 30));

      expect(result.coverage.equals(set)).toBe(true);
      expect(result.merged.equals(r(1, 100))).toBe(true);
      expect(ords(result.absorbed)).toEqual([[1, 100]]);
    });
  });

  describe('contains / covers', () => {
    const set = CoverageSet.fromRanges([r(1, 10), r(20, 30)]);

    it('is true only when the whole range sits inside one interval', () => {
      expect(set.contains(r(1, 10))).toBe(true);
      expect(set.contains(r(22, 25))).toBe(true);
      expect(set.contains(r(5, 22))).toBe(false);
      expect(set.contains(r(11, 11))).toBe(false);
      expect(set.contains(r(31, 40))).toBe(false);
    });

    it('covers a subset and not a superset', () => {
      const subset = CoverageSet.fromRanges([r(2, 3), r(20, 30)]);
      const superset = CoverageSet.fromRanges([r(1, 31)]);
      expect(set.covers(subset)).toBe(true);
      expect(set.covers(superset)).toBe(false);
      expect(set.covers(CoverageSet.empty())).toBe(true);
    });
  });

  it('counts covered ayat as the sum of closed-range lengths', () => {
    const set = CoverageSet.fromRanges([r(1, 10), r(20, 20)]);
    expect(set.coveredAyahCount).toBe(11);
  });
});
