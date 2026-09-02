import { InvalidCoverageIntervalError } from './coverage.errors';

/** The slice of `surahs` reference data (DBT-11) AyahPosition needs. */
export interface SurahOrdinalInfo {
  number: number;
  ayahCount: number;
  ordinalOffset: number;
}

/**
 * VO-01 AyahPosition (DMS §8): a single point in the Quran, identified by
 * (surah_number, ayah_number) with its canonical ordinal derived per SAS §17.6:
 *
 *   ordinal(s, a) = surah[s].ordinal_offset + a,   ordinal ∈ [1, T]
 *
 * Equality is by ordinal.
 */
export class AyahPosition {
  private constructor(
    public readonly surah: number,
    public readonly ayah: number,
    public readonly ordinal: number,
  ) {}

  /** Reconstructs (surah, ayah) from a stored ordinal (TS §23 display path). */
  static fromOrdinal(
    ordinal: number,
    surahs: readonly SurahOrdinalInfo[],
  ): AyahPosition {
    if (!Number.isInteger(ordinal) || ordinal < 1) {
      throw new InvalidCoverageIntervalError(
        'Ayah ordinal must be a positive integer',
      );
    }

    const surah = surahs.find(
      (s) =>
        ordinal > s.ordinalOffset && ordinal <= s.ordinalOffset + s.ayahCount,
    );
    if (!surah) {
      throw new InvalidCoverageIntervalError(
        `Ayah ordinal ${ordinal} is outside the reference dataset`,
      );
    }

    return new AyahPosition(
      surah.number,
      ordinal - surah.ordinalOffset,
      ordinal,
    );
  }

  /** Builds from (surah, ayah), validating both against the reference data. */
  static fromSurahAyah(
    surahNumber: number,
    ayahNumber: number,
    surahs: readonly SurahOrdinalInfo[],
  ): AyahPosition {
    const surah = surahs.find((s) => s.number === surahNumber);
    if (!surah) {
      throw new InvalidCoverageIntervalError(
        `Surah ${surahNumber} is outside the reference dataset`,
      );
    }
    if (
      !Number.isInteger(ayahNumber) ||
      ayahNumber < 1 ||
      ayahNumber > surah.ayahCount
    ) {
      throw new InvalidCoverageIntervalError(
        `Ayah ${ayahNumber} is not valid for surah ${surahNumber}`,
      );
    }

    return new AyahPosition(
      surahNumber,
      ayahNumber,
      surah.ordinalOffset + ayahNumber,
    );
  }

  equals(other: AyahPosition): boolean {
    return this.ordinal === other.ordinal;
  }
}

/** T — the total ayah count of the reference dataset (SAS §17.6). */
export function totalAyahCount(surahs: readonly SurahOrdinalInfo[]): number {
  return surahs.reduce((sum, s) => sum + s.ayahCount, 0);
}
