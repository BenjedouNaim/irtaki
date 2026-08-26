import {
  buildSurahIndex,
  toOrdinal,
  compareAyahPositions,
  isAyahDisabledForTo,
  AyahPosition,
} from '../ayahRange';
import { SurahDto } from '../../../../shared/api/quran.client';

const mockSurahs: SurahDto[] = [
  { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
  { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
  { number: 3, name_ar: 'آل عمران', ayah_count: 200, ordinal_offset: 293 },
  { number: 114, name_ar: 'الناس', ayah_count: 6, ordinal_offset: 6208 },
];

describe('ayahRange utilities', () => {
  const surahIndex = buildSurahIndex(mockSurahs);

  describe('buildSurahIndex', () => {
    it('creates a lookup map keyed by surah number', () => {
      expect(surahIndex.get(1)?.name_ar).toBe('الفاتحة');
      expect(surahIndex.get(2)?.ayah_count).toBe(286);
      expect(surahIndex.get(114)?.ordinal_offset).toBe(6208);
      expect(surahIndex.get(999)).toBeUndefined();
    });
  });

  describe('toOrdinal', () => {
    it('calculates the correct 1-based canonical ordinal', () => {
      // Al-Fatiha Ayah 1 -> offset 0 + 1 = 1
      expect(toOrdinal(surahIndex, { surah: 1, ayah: 1 })).toBe(1);
      // Al-Fatiha Ayah 7 -> offset 0 + 7 = 7
      expect(toOrdinal(surahIndex, { surah: 1, ayah: 7 })).toBe(7);
      // Al-Baqara Ayah 1 -> offset 7 + 1 = 8
      expect(toOrdinal(surahIndex, { surah: 2, ayah: 1 })).toBe(8);
      // Al-Baqara Ayah 286 -> offset 7 + 286 = 293
      expect(toOrdinal(surahIndex, { surah: 2, ayah: 286 })).toBe(293);
      // Aal Imran Ayah 1 -> offset 293 + 1 = 294
      expect(toOrdinal(surahIndex, { surah: 3, ayah: 1 })).toBe(294);
      // An-Nas Ayah 6 -> offset 6208 + 6 = 6214
      expect(toOrdinal(surahIndex, { surah: 114, ayah: 6 })).toBe(6214);
    });

    it('returns NaN for unknown surah numbers', () => {
      expect(toOrdinal(surahIndex, { surah: 999, ayah: 1 })).toBeNaN();
    });
  });

  describe('compareAyahPositions', () => {
    it('correctly compares positions within the same surah', () => {
      const pos1: AyahPosition = { surah: 2, ayah: 10 };
      const pos2: AyahPosition = { surah: 2, ayah: 20 };
      const pos3: AyahPosition = { surah: 2, ayah: 10 };

      expect(compareAyahPositions(surahIndex, pos1, pos2)).toBeLessThan(0);
      expect(compareAyahPositions(surahIndex, pos2, pos1)).toBeGreaterThan(0);
      expect(compareAyahPositions(surahIndex, pos1, pos3)).toBe(0);
    });

    it('correctly compares positions across different surahs', () => {
      const fatihaEnd: AyahPosition = { surah: 1, ayah: 7 };
      const baqaraStart: AyahPosition = { surah: 2, ayah: 1 };

      expect(compareAyahPositions(surahIndex, fatihaEnd, baqaraStart)).toBeLessThan(0);
      expect(compareAyahPositions(surahIndex, baqaraStart, fatihaEnd)).toBeGreaterThan(0);
    });
  });

  describe('isAyahDisabledForTo (VR-14a)', () => {
    const fromPosition: AyahPosition = { surah: 2, ayah: 15 }; // ordinal = 7 + 15 = 22

    it('returns false if fromPosition is undefined', () => {
      expect(isAyahDisabledForTo(surahIndex, undefined, { surah: 2, ayah: 10 })).toBe(false);
    });

    it('disables candidate ayahs within the same surah that are before fromPosition', () => {
      // Ayah 14 (ordinal 21) < Ayah 15 (ordinal 22) -> disabled
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 2, ayah: 14 })).toBe(true);
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 2, ayah: 1 })).toBe(true);
    });

    it('enables the exact same ayah (single-ayah range)', () => {
      // Ayah 15 (ordinal 22) == Ayah 15 (ordinal 22) -> enabled
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 2, ayah: 15 })).toBe(false);
    });

    it('enables candidate ayahs within the same surah that are after fromPosition', () => {
      // Ayah 16 (ordinal 23) > Ayah 15 (ordinal 22) -> enabled
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 2, ayah: 16 })).toBe(false);
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 2, ayah: 286 })).toBe(false);
    });

    it('disables all candidate ayahs in surahs before fromPosition (cross-surah)', () => {
      // Surah 1 (Al-Fatiha) ayahs 1..7 (ordinals 1..7) < 22 -> all disabled
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 1, ayah: 1 })).toBe(true);
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 1, ayah: 7 })).toBe(true);
    });

    it('enables all candidate ayahs in surahs after fromPosition (cross-surah)', () => {
      // Surah 3 (Aal Imran) ayahs 1..200 (ordinals >= 294) > 22 -> all enabled
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 3, ayah: 1 })).toBe(false);
      expect(isAyahDisabledForTo(surahIndex, fromPosition, { surah: 114, ayah: 6 })).toBe(false);
    });
  });
});
