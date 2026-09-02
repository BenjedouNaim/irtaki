import { AyahPosition, SurahOrdinalInfo } from './ayah-position';
import { InvalidCoverageIntervalError } from './coverage.errors';

/** A (surah, ayah) coordinate pair, as submitted before it becomes a VO-01. */
export interface AyahCoordinates {
  surah: number;
  ayah: number;
}

/**
 * VO-02 AyahRange (DMS §8, §19.2): a span between two positions,
 * `start: AyahPosition` and `end: AyahPosition`, valid only when
 * `end.ordinal >= start.ordinal` (BR-52).
 *
 * This is the single place where BR-52 is enforced (TS §23) and the only
 * range abstraction shared by DailyReport and MemorizationCoverage — every
 * interval of a CoverageSet (VO-07) is an AyahRange. Ordinal arithmetic on a
 * range reduces to its two endpoints' ordinals (SAS §17.6). Equality is
 * structural.
 */
export class AyahRange {
  private constructor(
    public readonly start: AyahPosition,
    public readonly end: AyahPosition,
  ) {}

  /** BR-52: the end position must not precede the start position. */
  static of(start: AyahPosition, end: AyahPosition): AyahRange {
    if (end.ordinal < start.ordinal) {
      throw new InvalidCoverageIntervalError(
        'Ayah range end must not precede its start (BR-52)',
      );
    }
    return new AyahRange(start, end);
  }

  /** Builds from two submitted (surah, ayah) coordinates (VR-13 path). */
  static fromSurahAyah(
    start: AyahCoordinates,
    end: AyahCoordinates,
    surahs: readonly SurahOrdinalInfo[],
  ): AyahRange {
    return AyahRange.of(
      AyahPosition.fromSurahAyah(start.surah, start.ayah, surahs),
      AyahPosition.fromSurahAyah(end.surah, end.ayah, surahs),
    );
  }

  /** Rebuilds from two persisted ordinals (`coverage_intervals`, DBT-10). */
  static fromOrdinals(
    startOrdinal: number,
    endOrdinal: number,
    surahs: readonly SurahOrdinalInfo[],
  ): AyahRange {
    return AyahRange.of(
      AyahPosition.fromOrdinal(startOrdinal, surahs),
      AyahPosition.fromOrdinal(endOrdinal, surahs),
    );
  }

  get startOrdinal(): number {
    return this.start.ordinal;
  }

  get endOrdinal(): number {
    return this.end.ordinal;
  }

  /** Closed-interval length — one term of "Σ interval lengths" (SAS §17.6). */
  get ayahCount(): number {
    return this.end.ordinal - this.start.ordinal + 1;
  }

  /** True when `other` lies entirely within this range. */
  contains(other: AyahRange): boolean {
    return (
      this.start.ordinal <= other.start.ordinal &&
      this.end.ordinal >= other.end.ordinal
    );
  }

  /**
   * True when the two ranges overlap or are adjacent — the "candidates"
   * predicate of SAS §17.6's `insert`.
   */
  touches(other: AyahRange): boolean {
    return (
      this.start.ordinal <= other.end.ordinal + 1 &&
      other.start.ordinal <= this.end.ordinal + 1
    );
  }

  equals(other: AyahRange): boolean {
    return this.start.equals(other.start) && this.end.equals(other.end);
  }
}
