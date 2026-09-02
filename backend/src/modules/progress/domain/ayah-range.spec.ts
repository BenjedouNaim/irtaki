import { AyahPosition, SurahOrdinalInfo } from './ayah-position';
import { AyahRange } from './ayah-range';
import { InvalidCoverageIntervalError } from './coverage.errors';

const SURAHS: SurahOrdinalInfo[] = [
  { number: 1, ayahCount: 7, ordinalOffset: 0 },
  { number: 2, ayahCount: 285, ordinalOffset: 7 },
  { number: 3, ayahCount: 200, ordinalOffset: 292 },
];

describe('AyahRange (VO-02)', () => {
  it('builds from two positions and exposes their ordinals', () => {
    const range = AyahRange.of(
      AyahPosition.fromSurahAyah(1, 1, SURAHS),
      AyahPosition.fromSurahAyah(2, 1, SURAHS),
    );
    expect(range.startOrdinal).toBe(1);
    expect(range.endOrdinal).toBe(8);
    expect(range.ayahCount).toBe(8);
  });

  it('builds from (surah, ayah) coordinates and from persisted ordinals identically', () => {
    const fromCoordinates = AyahRange.fromSurahAyah(
      { surah: 2, ayah: 10 },
      { surah: 3, ayah: 5 },
      SURAHS,
    );
    const fromOrdinals = AyahRange.fromOrdinals(17, 297, SURAHS);

    expect(fromCoordinates.equals(fromOrdinals)).toBe(true);
    expect(fromOrdinals.start).toMatchObject({ surah: 2, ayah: 10 });
    expect(fromOrdinals.end).toMatchObject({ surah: 3, ayah: 5 });
  });

  it('accepts a single-ayah range (end equals start)', () => {
    const range = AyahRange.fromOrdinals(42, 42, SURAHS);
    expect(range.ayahCount).toBe(1);
  });

  it('rejects an end that precedes its start (BR-52)', () => {
    expect(() => AyahRange.fromOrdinals(10, 9, SURAHS)).toThrow(
      InvalidCoverageIntervalError,
    );
    expect(() =>
      AyahRange.fromSurahAyah(
        { surah: 2, ayah: 1 },
        { surah: 1, ayah: 7 },
        SURAHS,
      ),
    ).toThrow(InvalidCoverageIntervalError);
  });

  it('rejects endpoints outside the reference dataset', () => {
    expect(() => AyahRange.fromOrdinals(0, 5, SURAHS)).toThrow(
      InvalidCoverageIntervalError,
    );
    expect(() => AyahRange.fromOrdinals(1, 493, SURAHS)).toThrow(
      InvalidCoverageIntervalError,
    );
    expect(() =>
      AyahRange.fromSurahAyah(
        { surah: 1, ayah: 1 },
        { surah: 1, ayah: 8 },
        SURAHS,
      ),
    ).toThrow(InvalidCoverageIntervalError);
  });

  it('knows containment', () => {
    const outer = AyahRange.fromOrdinals(10, 30, SURAHS);
    expect(outer.contains(AyahRange.fromOrdinals(10, 30, SURAHS))).toBe(true);
    expect(outer.contains(AyahRange.fromOrdinals(15, 20, SURAHS))).toBe(true);
    expect(outer.contains(AyahRange.fromOrdinals(9, 20, SURAHS))).toBe(false);
    expect(outer.contains(AyahRange.fromOrdinals(20, 31, SURAHS))).toBe(false);
  });

  it('touches overlapping and adjacent ranges but not separated ones', () => {
    const range = AyahRange.fromOrdinals(10, 20, SURAHS);
    expect(range.touches(AyahRange.fromOrdinals(15, 25, SURAHS))).toBe(true);
    expect(range.touches(AyahRange.fromOrdinals(21, 25, SURAHS))).toBe(true);
    expect(range.touches(AyahRange.fromOrdinals(5, 9, SURAHS))).toBe(true);
    expect(range.touches(AyahRange.fromOrdinals(22, 25, SURAHS))).toBe(false);
    expect(range.touches(AyahRange.fromOrdinals(1, 8, SURAHS))).toBe(false);
  });

  it('is equal by structure, not identity', () => {
    const a = AyahRange.fromOrdinals(1, 7, SURAHS);
    const b = AyahRange.fromOrdinals(1, 7, SURAHS);
    const c = AyahRange.fromOrdinals(1, 8, SURAHS);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
