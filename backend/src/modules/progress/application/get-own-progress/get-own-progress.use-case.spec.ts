/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import {
  IMembershipRepository,
  OwnActiveMembershipRecord,
} from '../../../memberships/domain/membership.repository.interface';
import {
  CoverageRecord,
  ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import {
  ISurahRepository,
  SurahRecord,
} from '../../domain/surah.repository.interface';
import { GetOwnProgressUseCase } from './get-own-progress.use-case';

describe('GetOwnProgressUseCase (F-PRG-02 / API-041)', () => {
  let useCase: GetOwnProgressUseCase;
  let membershipRepository: jest.Mocked<IMembershipRepository>;
  let coverageRepository: jest.Mocked<ICoverageRepository>;
  let surahRepository: jest.Mocked<ISurahRepository>;

  const userId = 'student-1';

  const activeMembership: OwnActiveMembershipRecord = {
    id: 'membership-1',
    group: {
      id: 'group-1',
      name: 'حلقة الإمام قالون',
      recitationDay: 4,
      enrollmentStatus: 'Closed',
    },
    startedAt: '2026-08-01',
    state: 'Active',
  };

  // Synthetic reference data: T = 1000 ayat across three surahs.
  const surahs: SurahRecord[] = [
    { number: 1, nameAr: 'أ', ayahCount: 100, ordinalOffset: 0 },
    { number: 2, nameAr: 'ب', ayahCount: 400, ordinalOffset: 100 },
    { number: 3, nameAr: 'ج', ayahCount: 500, ordinalOffset: 500 },
  ];

  beforeEach(() => {
    membershipRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findRosterByGroupId: jest.fn(),
      findByIdForRecovery: jest.fn(),
      findStateAndUserById: jest.fn(),
      terminateConditionally: jest.fn(),
      softDeleteMembershipRecords: jest.fn(),
    };
    coverageRepository = {
      seedFromHizbSelection: jest.fn(),
      findByMembershipId: jest.fn(),
      applyMerge: jest.fn(),
    };
    surahRepository = {
      findAll: jest.fn().mockResolvedValue(surahs),
    };

    useCase = new GetOwnProgressUseCase(
      membershipRepository,
      coverageRepository,
      surahRepository,
    );
  });

  it('returns the API-041 envelope with derived figures and the DEC-D02 flag', async () => {
    membershipRepository.findActiveByUserId.mockResolvedValue(activeMembership);
    const record: CoverageRecord = {
      id: 'coverage-1',
      membershipId: 'membership-1',
      ahzabCompleted: 3,
      lastMemorizedOrdinal: 150,
      intervals: [
        { startOrdinal: 1, endOrdinal: 200 },
        { startOrdinal: 601, endOrdinal: 650 },
      ],
    };
    coverageRepository.findByMembershipId.mockResolvedValue(record);

    const result = await useCase.execute(userId);

    expect(membershipRepository.findActiveByUserId).toHaveBeenCalledWith(
      userId,
    );
    expect(coverageRepository.findByMembershipId).toHaveBeenCalledWith(
      'membership-1',
    );
    expect(result).toEqual({
      data: {
        ahzab_completed: 3,
        coverage_percent: 25,
        last_memorized_position: { surah: 2, ayah: 50, ordinal: 150 },
        is_activity_pointer_only: true,
      },
    });
  });

  it('returns a null activity pointer for a freshly seeded coverage', async () => {
    membershipRepository.findActiveByUserId.mockResolvedValue(activeMembership);
    coverageRepository.findByMembershipId.mockResolvedValue({
      id: 'coverage-1',
      membershipId: 'membership-1',
      ahzabCompleted: 0,
      lastMemorizedOrdinal: null,
      intervals: [],
    });

    const result = await useCase.execute(userId);

    expect(result.data).toEqual({
      ahzab_completed: 0,
      coverage_percent: 0,
      last_memorized_position: null,
      is_activity_pointer_only: true,
    });
  });

  it('rounds coverage_percent to two decimals', async () => {
    membershipRepository.findActiveByUserId.mockResolvedValue(activeMembership);
    coverageRepository.findByMembershipId.mockResolvedValue({
      id: 'coverage-1',
      membershipId: 'membership-1',
      ahzabCompleted: 0,
      lastMemorizedOrdinal: null,
      intervals: [{ startOrdinal: 1, endOrdinal: 1 }],
    });

    const result = await useCase.execute(userId);

    expect(result.data.coverage_percent).toBe(0.1);
  });

  it('throws 404 NOT_FOUND when the caller has no active membership', async () => {
    membershipRepository.findActiveByUserId.mockResolvedValue(null);

    await expect(useCase.execute(userId)).rejects.toThrow(NotFoundException);
    expect(coverageRepository.findByMembershipId).not.toHaveBeenCalled();
  });

  it('throws 404 NOT_FOUND when the membership has no live coverage row', async () => {
    membershipRepository.findActiveByUserId.mockResolvedValue(activeMembership);
    coverageRepository.findByMembershipId.mockResolvedValue(null);

    await expect(useCase.execute(userId)).rejects.toThrow(NotFoundException);
  });
});
