/* eslint-disable @typescript-eslint/unbound-method */
import {
  ISurahRepository,
  SurahRecord,
} from '../../domain/surah.repository.interface';
import { ListSurahsUseCase } from './list-surahs.use-case';

describe('ListSurahsUseCase', () => {
  let useCase: ListSurahsUseCase;
  let surahRepository: jest.Mocked<ISurahRepository>;

  const mockSurahs: SurahRecord[] = [
    {
      number: 1,
      nameAr: 'الفَاتِحة',
      ayahCount: 7,
      ordinalOffset: 0,
    },
    {
      number: 2,
      nameAr: 'البَقَرَة',
      ayahCount: 285,
      ordinalOffset: 7,
    },
    {
      number: 114,
      nameAr: 'النَّاس',
      ayahCount: 6,
      ordinalOffset: 6208,
    },
  ];

  beforeEach(() => {
    surahRepository = {
      findAll: jest.fn(),
    };
    useCase = new ListSurahsUseCase(surahRepository);
  });

  it('returns all surahs mapped to snake_case wire shape', async () => {
    surahRepository.findAll.mockResolvedValue(mockSurahs);

    const result = await useCase.execute();

    expect(result).toEqual([
      {
        number: 1,
        name_ar: 'الفَاتِحة',
        ayah_count: 7,
        ordinal_offset: 0,
      },
      {
        number: 2,
        name_ar: 'البَقَرَة',
        ayah_count: 285,
        ordinal_offset: 7,
      },
      {
        number: 114,
        name_ar: 'النَّاس',
        ayah_count: 6,
        ordinal_offset: 6208,
      },
    ]);
    expect(surahRepository.findAll).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when repository returns empty array', async () => {
    surahRepository.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
    expect(surahRepository.findAll).toHaveBeenCalledTimes(1);
  });
});
