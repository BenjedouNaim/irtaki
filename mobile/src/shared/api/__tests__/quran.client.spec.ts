import { listSurahs, listHizbBoundaries, SurahDto, HizbBoundaryDto } from '../quran.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('quran.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listSurahs', () => {
    it('should call apiClient.get with /quran/surahs and return raw array without wrapping/unwrapping', async () => {
      const mockSurahs: SurahDto[] = [
        { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
        { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
      ];

      (apiClient.get as jest.Mock).mockResolvedValue(mockSurahs);

      const result = await listSurahs();

      expect(apiClient.get).toHaveBeenCalledWith('/quran/surahs');
      expect(result).toEqual(mockSurahs);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('listHizbBoundaries', () => {
    it('should call apiClient.get with /quran/hizb-boundaries and return raw array', async () => {
      const mockBoundaries: HizbBoundaryDto[] = [
        {
          hizb_number: 1,
          start: { surah: 1, ayah: 1 },
          end: { surah: 2, ayah: 25 },
        },
        {
          hizb_number: 2,
          start: { surah: 2, ayah: 26 },
          end: { surah: 2, ayah: 43 },
        },
      ];

      (apiClient.get as jest.Mock).mockResolvedValue(mockBoundaries);

      const result = await listHizbBoundaries();

      expect(apiClient.get).toHaveBeenCalledWith('/quran/hizb-boundaries');
      expect(result).toEqual(mockBoundaries);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
