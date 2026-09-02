import { InvalidCoverageIntervalError } from './coverage.errors';

/**
 * One closed ordinal range [startOrdinal, endOrdinal] in the canonical
 * ayah-ordinal space (SAS §17.6: ordinal(s, a) = surah[s].ordinal_offset + a).
 * Mirrors a `coverage_intervals` row (DBT-10).
 */
export interface CoverageInterval {
  startOrdinal: number;
  endOrdinal: number;
}

export interface CoverageInsertResult {
  /** The coverage after the insertion. */
  coverage: CoverageSet;
  /** The single interval that now covers the inserted range. */
  merged: CoverageInterval;
  /** Prior intervals absorbed into `merged` (every one lies within it). */
  absorbed: CoverageInterval[];
}

function assertValidInterval(interval: CoverageInterval): void {
  const { startOrdinal, endOrdinal } = interval;
  if (
    !Number.isInteger(startOrdinal) ||
    !Number.isInteger(endOrdinal) ||
    startOrdinal < 1
  ) {
    throw new InvalidCoverageIntervalError(
      'Coverage interval ordinals must be positive integers',
    );
  }
  if (endOrdinal < startOrdinal) {
    throw new InvalidCoverageIntervalError(
      'Coverage interval end ordinal must be >= start ordinal (BR-52)',
    );
  }
}

/**
 * VO-07 CoverageSet (DMS §8, SAS §17.6).
 *
 * An ordered set of disjoint, non-adjacent ordinal intervals. Closed under
 * union: `insert` merges every overlapping or adjacent interval into one, so a
 * set can only ever grow (INV-18). Immutable — every operation returns a new
 * instance.
 */
export class CoverageSet {
  private constructor(
    private readonly _intervals: readonly CoverageInterval[],
  ) {}

  static empty(): CoverageSet {
    return new CoverageSet([]);
  }

  /**
   * Builds a set from arbitrary intervals, normalising them into disjoint,
   * non-adjacent, ascending order. Persisted intervals are always already
   * normalised; the fold is idempotent on such input.
   */
  static fromIntervals(intervals: readonly CoverageInterval[]): CoverageSet {
    intervals.forEach(assertValidInterval);

    const sorted = [...intervals].sort(
      (a, b) => a.startOrdinal - b.startOrdinal,
    );

    const normalised: CoverageInterval[] = [];
    for (const interval of sorted) {
      const last = normalised[normalised.length - 1];
      if (last && interval.startOrdinal <= last.endOrdinal + 1) {
        normalised[normalised.length - 1] = {
          startOrdinal: last.startOrdinal,
          endOrdinal: Math.max(last.endOrdinal, interval.endOrdinal),
        };
      } else {
        normalised.push({
          startOrdinal: interval.startOrdinal,
          endOrdinal: interval.endOrdinal,
        });
      }
    }

    return new CoverageSet(normalised);
  }

  get intervals(): readonly CoverageInterval[] {
    return this._intervals;
  }

  get isEmpty(): boolean {
    return this._intervals.length === 0;
  }

  /** Σ interval lengths — the numerator of `coverage_percent` (SAS §17.6). */
  get coveredAyahCount(): number {
    return this._intervals.reduce(
      (sum, i) => sum + (i.endOrdinal - i.startOrdinal + 1),
      0,
    );
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
  insert(range: CoverageInterval): CoverageInsertResult {
    assertValidInterval(range);

    const lo = range.startOrdinal;
    const hi = range.endOrdinal;

    // First interval whose end reaches lo - 1 (ends are ascending because the
    // intervals are disjoint and sorted by start).
    const first = this.lowerBoundByEnd(lo - 1);

    let last = first;
    while (
      last < this._intervals.length &&
      this._intervals[last].startOrdinal <= hi + 1
    ) {
      last++;
    }

    const absorbed = this._intervals.slice(first, last);

    const merged: CoverageInterval = {
      startOrdinal: Math.min(lo, ...absorbed.map((i) => i.startOrdinal)),
      endOrdinal: Math.max(hi, ...absorbed.map((i) => i.endOrdinal)),
    };

    const next = [
      ...this._intervals.slice(0, first),
      merged,
      ...this._intervals.slice(last),
    ];

    return {
      coverage: new CoverageSet(next),
      merged,
      absorbed: absorbed.map((i) => ({ ...i })),
    };
  }

  /** True when the whole closed range [lo, hi] lies inside one interval. */
  contains(range: CoverageInterval): boolean {
    assertValidInterval(range);

    const idx = this.lowerBoundByEnd(range.startOrdinal);
    if (idx >= this._intervals.length) {
      return false;
    }
    const candidate = this._intervals[idx];
    return (
      candidate.startOrdinal <= range.startOrdinal &&
      candidate.endOrdinal >= range.endOrdinal
    );
  }

  /** True when every interval of `other` is contained in this set. */
  covers(other: CoverageSet): boolean {
    return other._intervals.every((i) => this.contains(i));
  }

  equals(other: CoverageSet): boolean {
    if (this._intervals.length !== other._intervals.length) {
      return false;
    }
    return this._intervals.every(
      (i, idx) =>
        i.startOrdinal === other._intervals[idx].startOrdinal &&
        i.endOrdinal === other._intervals[idx].endOrdinal,
    );
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
