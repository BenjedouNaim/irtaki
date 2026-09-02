/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
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
  const teacherId = 'teacher-1';
  const adminId = 'admin-1';

  const surahs: SurahRecord[] = [
    { number: 1, nameAr: 'أ', ayahCount: 100, ordinalOffset: 0 },
    { number: 2, nameAr: 'ب', ayahCount: 900, ordinalOffset: 100 },
  ];

  const coverage: CoverageRecord = {
    id: 'coverage-1',
    membershipId,
    ahzabCompleted: 4,
    lastMemorizedOrdinal: 250,
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
      findByMembershipIdForStaff: jest.fn(),
      applyMerge: jest.fn(),
    };
    surahRepository = { findAll: jest.fn().mockResolvedValue(surahs) };

    useCase = new GetMembershipProgressUseCase(
      coverageRepository,
      surahRepository,
    );
  });

  describe('Teacher', () => {
    it('returns the student coverage resolved with the Teacher scope in the query', async () => {
      coverageRepository.findByMembershipIdForStaff.mockResolvedValue(coverage);

      const result = await useCase.execute(
        teacherId,
        UserRole.Teacher,
        membershipId,
      );

      expect(
        coverageRepository.findByMembershipIdForStaff,
      ).toHaveBeenCalledWith(membershipId, {
        callerId: teacherId,
        isAdmin: false,
      });
      expect(result).toEqual(expectedPayload);
    });

    it('throws the uniform 403 when the scoped lookup returns nothing (out of scope, non-existent or terminated — NFR-20)', async () => {
      coverageRepository.findByMembershipIdForStaff.mockResolvedValue(null);

      await expect(
        useCase.execute(teacherId, UserRole.Teacher, membershipId),
      ).rejects.toThrow(ForbiddenException);
      expect(surahRepository.findAll).not.toHaveBeenCalled();
    });

    it('throws 403 for a malformed id without hitting the database', async () => {
      await expect(
        useCase.execute(teacherId, UserRole.Teacher, 'not-a-uuid'),
      ).rejects.toThrow(ForbiddenException);
      expect(
        coverageRepository.findByMembershipIdForStaff,
      ).not.toHaveBeenCalled();
    });
  });

  describe('Admin', () => {
    it('returns any student coverage with the scope predicate bypassed (DEC-C07)', async () => {
      coverageRepository.findByMembershipIdForStaff.mockResolvedValue(coverage);

      const result = await useCase.execute(
        adminId,
        UserRole.Admin,
        membershipId,
      );

      expect(
        coverageRepository.findByMembershipIdForStaff,
      ).toHaveBeenCalledWith(membershipId, {
        callerId: adminId,
        isAdmin: true,
      });
      expect(result).toEqual(expectedPayload);
    });

    it('throws the same 403 as a Teacher for a non-existent or terminated membership (SA §14)', async () => {
      coverageRepository.findByMembershipIdForStaff.mockResolvedValue(null);

      await expect(
        useCase.execute(adminId, UserRole.Admin, membershipId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws the same 403 for a malformed id', async () => {
      await expect(
        useCase.execute(adminId, UserRole.Admin, 'not-a-uuid'),
      ).rejects.toThrow(ForbiddenException);
      expect(
        coverageRepository.findByMembershipIdForStaff,
      ).not.toHaveBeenCalled();
    });
  });

  it.each([UserRole.Assistant, UserRole.Student, UserRole.User])(
    'throws 403 for the %s role without any lookup',
    async (role) => {
      await expect(
        useCase.execute('someone', role, membershipId),
      ).rejects.toThrow(ForbiddenException);
      expect(
        coverageRepository.findByMembershipIdForStaff,
      ).not.toHaveBeenCalled();
    },
  );
});
