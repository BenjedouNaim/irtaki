/* eslint-disable @typescript-eslint/unbound-method */
import {
  IHizbBoundaryRepository,
  HizbBoundaryRecord,
} from '../../domain/hizb-boundary.repository.interface';
import { GetHizbBoundariesUseCase } from './get-hizb-boundaries.use-case';

describe('GetHizbBoundariesUseCase', () => {
  let useCase: GetHizbBoundariesUseCase;
  let hizbBoundaryRepository: jest.Mocked<IHizbBoundaryRepository>;

  const mockBoundaries: HizbBoundaryRecord[] = [
    {
      hizbNumber: 1,
      startOrdinal: 1,
      endOrdinal: 81,
      startSurah: 1,
      startAyah: 1,
      endSurah: 2,
      endAyah: 74,
    },
    {
      hizbNumber: 2,
      startOrdinal: 82,
      endOrdinal: 147,
      startSurah: 2,
      startAyah: 75,
      endSurah: 2,
      endAyah: 140,
    },
    {
      hizbNumber: 60,
      startOrdinal: 5644,
      endOrdinal: 6214,
      startSurah: 87,
      startAyah: 1,
      endSurah: 114,
      endAyah: 6,
    },
  ];

  beforeEach(() => {
    hizbBoundaryRepository = {
      findAll: jest.fn(),
    };
    useCase = new GetHizbBoundariesUseCase(hizbBoundaryRepository);
  });

  it('returns all hizb boundaries mapped to snake_case nested wire shape', async () => {
    hizbBoundaryRepository.findAll.mockResolvedValue(mockBoundaries);

    const result = await useCase.execute();

    expect(result).toEqual([
      {
        hizb_number: 1,
        start: {
          surah: 1,
          ayah: 1,
        },
        end: {
          surah: 2,
          ayah: 74,
        },
      },
      {
        hizb_number: 2,
        start: {
          surah: 2,
          ayah: 75,
        },
        end: {
          surah: 2,
          ayah: 140,
        },
      },
      {
        hizb_number: 60,
        start: {
          surah: 87,
          ayah: 1,
        },
        end: {
          surah: 114,
          ayah: 6,
        },
      },
    ]);
    expect(hizbBoundaryRepository.findAll).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when repository returns empty array', async () => {
    hizbBoundaryRepository.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
    expect(hizbBoundaryRepository.findAll).toHaveBeenCalledTimes(1);
  });
});
