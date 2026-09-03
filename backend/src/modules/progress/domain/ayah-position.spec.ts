import {
  AyahPosition,
  SurahOrdinalInfo,
  totalAyahCount,
} from './ayah-position';
import { InvalidCoverageIntervalError } from './coverage.errors';

const SURAHS: SurahOrdinalInfo[] = [
  { number: 1, ayahCount: 7, ordinalOffset: 0 },
  { number: 2, ayahCount: 285, ordinalOffset: 7 },
  { number: 3, ayahCount: 200, ordinalOffset: 292 },
];

describe('AyahPosition (VO-01)', () => {
  it('derives the canonical ordinal from (surah, ayah)', () => {
    const p = AyahPosition.fromSurahAyah(2, 1, SURAHS);
    expect(p.ordinal).toBe(8);
    expect(AyahPosition.fromSurahAyah(1, 7, SURAHS).ordinal).toBe(7);
    expect(AyahPosition.fromSurahAyah(3, 200, SURAHS).ordinal).toBe(492);
  });

  it('reconstructs (surah, ayah) from an ordinal, including surah boundaries', () => {
    expect(AyahPosition.fromOrdinal(1, SURAHS)).toMatchObject({
      surah: 1,
      ayah: 1,
      ordinal: 1,
    });
    expect(AyahPosition.fromOrdinal(7, SURAHS)).toMatchObject({
      surah: 1,
      ayah: 7,
    });
    expect(AyahPosition.fromOrdinal(8, SURAHS)).toMatchObject({
      surah: 2,
      ayah: 1,
    });
    expect(AyahPosition.fromOrdinal(292, SURAHS)).toMatchObject({
      surah: 2,
      ayah: 285,
    });
    expect(AyahPosition.fromOrdinal(492, SURAHS)).toMatchObject({
      surah: 3,
      ayah: 200,
    });
  });

  it('round-trips through both factories', () => {
    for (const ordinal of [1, 7, 8, 100, 292, 293, 492]) {
      const p = AyahPosition.fromOrdinal(ordinal, SURAHS);
      const back = AyahPosition.fromSurahAyah(p.surah, p.ayah, SURAHS);
      expect(back.equals(p)).toBe(true);
    }
  });

  it('rejects positions outside the reference dataset', () => {
    expect(() => AyahPosition.fromOrdinal(0, SURAHS)).toThrow(
      InvalidCoverageIntervalError,
    );
    expect(() => AyahPosition.fromOrdinal(493, SURAHS)).toThrow(
      InvalidCoverageIntervalError,
    );
    expect(() => AyahPosition.fromSurahAyah(4, 1, SURAHS)).toThrow(
      InvalidCoverageIntervalError,
    );
    expect(() => AyahPosition.fromSurahAyah(1, 8, SURAHS)).toThrow(
      InvalidCoverageIntervalError,
    );
    expect(() => AyahPosition.fromSurahAyah(1, 0, SURAHS)).toThrow(
      InvalidCoverageIntervalError,
    );
  });

  it('computes T as the sum of ayah counts', () => {
    expect(totalAyahCount(SURAHS)).toBe(492);
    expect(totalAyahCount([])).toBe(0);
  });
  it('rejects a non-integer or non-positive ordinal (VR-13)', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => AyahPosition.fromOrdinal(bad, SURAHS)).toThrow(
        InvalidCoverageIntervalError,
      );
    }
  });

  it('rejects a non-integer ayah number for a valid surah (VR-13)', () => {
    for (const bad of [1.5, -2, Number.NaN]) {
      expect(() => AyahPosition.fromSurahAyah(1, bad, SURAHS)).toThrow(
        InvalidCoverageIntervalError,
      );
    }
  });

  it('rejects a surah number outside 1..114 (VO-01 validation, VR-13)', () => {
    for (const bad of [0, -1, 115, 1.5]) {
      expect(() => AyahPosition.fromSurahAyah(bad, 1, SURAHS)).toThrow(
        InvalidCoverageIntervalError,
      );
    }
  });
});
