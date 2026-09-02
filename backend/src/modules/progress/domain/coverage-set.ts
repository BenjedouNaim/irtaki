import { AyahRange } from './ayah-range';

export interface CoverageInsertResult {
  /** The coverage after the insertion. */
  coverage: CoverageSet;
  /** The single range that now covers the inserted one. */
  merged: AyahRange;
  /** Prior ranges absorbed into `merged` (every one lies within it). */
  absorbed: AyahRange[];
}

function earlierStart(a: AyahRange, b: AyahRange): AyahRange {
  return b.startOrdinal < a.startOrdinal ? b : a;
}

function laterEnd(a: AyahRange, b: AyahRange): AyahRange {
  return b.endOrdinal > a.endOrdinal ? b : a;
}

/** The smallest range spanning every range given (all must touch in a chain). */
function span(ranges: readonly AyahRange[]): AyahRange {
  const first = ranges.reduce(earlierStart);
  const last = ranges.reduce(laterEnd);
  return AyahRange.of(first.start, last.end);
}

/**
 * VO-07 CoverageSet (DMS §8, SAS §17.6).
 *
 * An ordered set of disjoint, non-adjacent AyahRanges (VO-02). Closed under
 * union: `insert` merges every overlapping or adjacent range into one, so a
 * set can only ever grow (INV-18). Immutable — every operation returns a new
 * instance. Range validity (BR-52) is AyahRange's responsibility, never
 * re-checked here.
 */
export class CoverageSet {
  private constructor(private readonly _intervals: readonly AyahRange[]) {}

  static empty(): CoverageSet {
    return new CoverageSet([]);
  }

  /**
   * Builds a set from arbitrary ranges, normalising them into disjoint,
   * non-adjacent, ascending order. Persisted intervals are always already
   * normalised; the fold is idempotent on such input.
   */
  static fromRanges(ranges: readonly AyahRange[]): CoverageSet {
    const sorted = [...ranges].sort((a, b) => a.startOrdinal - b.startOrdinal);

    const normalised: AyahRange[] = [];
    for (const range of sorted) {
      const last = normalised[normalised.length - 1];
      if (last && last.touches(range)) {
        normalised[normalised.length - 1] = span([last, range]);
      } else {
        normalised.push(range);
      }
    }

    return new CoverageSet(normalised);
  }

  get intervals(): readonly AyahRange[] {
    return this._intervals;
  }

  get isEmpty(): boolean {
    return this._intervals.length === 0;
  }

  /** Σ interval lengths — the numerator of `coverage_percent` (SAS §17.6). */
  get coveredAyahCount(): number {
    return this._intervals.reduce((sum, i) => sum + i.ayahCount, 0);
  }

  /**
   * SAS §17.6 `insert(coverage, [lo, hi])`:
   *   candidates ← intervals overlapping or adjacent to [lo, hi]
   *   merged     ← [min(lo, min start of candidates),
   *                 max(hi, max end of candidates)]
   *   coverage   ← (coverage − candidates) ∪ { merged }
   *
   * O(log n + k): binary search for the first candidate, then a scan over the
   * k merged neighbours.
   */
  insert(range: AyahRange): CoverageInsertResult {
    // First interval whose end reaches lo - 1 (ends are ascending because the
    // intervals are disjoint and sorted by start).
    const first = this.lowerBoundByEnd(range.startOrdinal - 1);

    let last = first;
    while (
      last < this._intervals.length &&
      this._intervals[last].startOrdinal <= range.endOrdinal + 1
    ) {
      last++;
    }

    const absorbed = this._intervals.slice(first, last);
    const merged = span([range, ...absorbed]);

    const next = [
      ...this._intervals.slice(0, first),
      merged,
      ...this._intervals.slice(last),
    ];

    return { coverage: new CoverageSet(next), merged, absorbed };
  }

  /** True when the whole range lies inside one interval. */
  contains(range: AyahRange): boolean {
    const idx = this.lowerBoundByEnd(range.startOrdinal);
    if (idx >= this._intervals.length) {
      return false;
    }
    return this._intervals[idx].contains(range);
  }

  /** True when every interval of `other` is contained in this set. */
  covers(other: CoverageSet): boolean {
    return other._intervals.every((i) => this.contains(i));
  }

  equals(other: CoverageSet): boolean {
    if (this._intervals.length !== other._intervals.length) {
      return false;
    }
    return this._intervals.every((i, idx) => i.equals(other._intervals[idx]));
  }

  /** Index of the first interval with endOrdinal >= value. */
  private lowerBoundByEnd(value: number): number {
    let low = 0;
    let high = this._intervals.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this._intervals[mid].endOrdinal < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
}
