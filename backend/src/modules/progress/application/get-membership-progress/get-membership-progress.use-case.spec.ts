/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import {
  CoverageRecord,
  ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import {
  ISurahRepository,
  SurahRecord,
} from '../../domain/surah.repository.interface';
import { GetMembershipProgressUseCase } from './get-membership-progress.use-case';

describe('GetMembershipProgressUseCase (F-PRG-03 / API-042)', () => {
  let useCase: GetMembershipProgressUseCase;
  let coverageRepository: jest.Mocked<ICoverageRepository>;
  let surahRepository: jest.Mocked<ISurahRepository>;

  const membershipId = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';

  const surahs: SurahRecord[] = [
    { number: 1, nameAr: 'أ', ayahCount: 100, ordinalOffset: 0 },
    { number: 2, nameAr: 'ب', ayahCount: 900, ordinalOffset: 100 },
  ];

  const coverage: CoverageRecord = {
    id: 'coverage-1',
    membershipId,
    ahzabCompleted: 4,
    lastMemorizedOrdinal: 250,
    updatedAt: new Date(),
    intervals: [{ startOrdinal: 1, endOrdinal: 500 }],
  };

  const expectedPayload = {
    data: {
      ahzab_completed: 4,
      coverage_percent: 50,
      last_memorized_position: { surah: 2, ayah: 150, ordinal: 250 },
      is_activity_pointer_only: true,
    },
  };

  beforeEach(() => {
    coverageRepository = {
      seedFromHizbSelection: jest.fn(),
      findByMembershipId: jest.fn(),
      findActiveByUserId: jest.fn(),
      findAllLiveForReconciliation: jest.fn(),
      correctAhzabCompleted: jest.fn(),
      applyMerge: jest.fn(),
    };
    surahRepository = { findAll: jest.fn().mockResolvedValue(surahs) };

    useCase = new GetMembershipProgressUseCase(
      coverageRepository,
      surahRepository,
    );
  });

  it('returns the student progress envelope when coverage exists', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(coverage);

    const result = await useCase.execute(membershipId);

    expect(coverageRepository.findByMembershipId).toHaveBeenCalledWith(
      membershipId,
    );
    expect(result).toEqual(expectedPayload);
  });

  it('throws 404 NOT_FOUND when the membership or live coverage does not exist', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(null);

    await expect(useCase.execute(membershipId)).rejects.toThrow(
      NotFoundException,
    );
    expect(surahRepository.findAll).not.toHaveBeenCalled();
  });
});
