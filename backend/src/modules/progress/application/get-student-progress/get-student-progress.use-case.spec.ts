/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  GroupListRow,
  IGroupRepository,
} from '../../../groups/domain/group.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  IMembershipRepository,
  MembershipScopeRecord,
} from '../../../memberships/domain/membership.repository.interface';
import {
  CoverageRecord,
  ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import {
  ISurahRepository,
  SurahRecord,
} from '../../domain/surah.repository.interface';
import { GetStudentProgressUseCase } from './get-student-progress.use-case';

describe('GetStudentProgressUseCase (F-PRG-03 / API-042)', () => {
  let useCase: GetStudentProgressUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;
  let membershipRepository: jest.Mocked<IMembershipRepository>;
  let coverageRepository: jest.Mocked<ICoverageRepository>;
  let surahRepository: jest.Mocked<ISurahRepository>;

  const membershipId = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';
  const teacherId = 'teacher-1';
  const adminId = 'admin-1';

  const membership: MembershipScopeRecord = {
    id: membershipId,
    groupId: 'group-1',
    userId: 'student-1',
    state: 'Active',
  };

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
    groupRepository = {
      findByStaffIdForList: jest.fn(),
      findByIdForDetail: jest.fn(),
    } as unknown as jest.Mocked<IGroupRepository>;
    membershipRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findRosterByGroupId: jest.fn(),
      findByIdForRecovery: jest.fn(),
      findStateAndUserById: jest.fn(),
      terminateConditionally: jest.fn(),
      softDeleteMembershipRecords: jest.fn(),
      findScopeById: jest.fn(),
    };
    coverageRepository = {
      seedFromHizbSelection: jest.fn(),
      findByMembershipId: jest.fn(),
      findActiveByUserId: jest.fn(),
      applyMerge: jest.fn(),
    };
    surahRepository = { findAll: jest.fn().mockResolvedValue(surahs) };

    useCase = new GetStudentProgressUseCase(
      groupRepository,
      membershipRepository,
      coverageRepository,
      surahRepository,
    );
  });

  describe('Teacher', () => {
    it('returns the student coverage when the membership belongs to an assigned group', async () => {
      membershipRepository.findScopeById.mockResolvedValue(membership);
      groupRepository.findByStaffIdForList.mockResolvedValue([
        { id: 'group-1' } as GroupListRow,
      ]);
      coverageRepository.findByMembershipId.mockResolvedValue(coverage);

      const result = await useCase.execute(
        teacherId,
        UserRole.Teacher,
        membershipId,
      );

      expect(groupRepository.findByStaffIdForList).toHaveBeenCalledWith(
        teacherId,
      );
      expect(result).toEqual(expectedPayload);
    });

    it('throws 403 for a membership of a group the Teacher is not assigned to', async () => {
      membershipRepository.findScopeById.mockResolvedValue(membership);
      groupRepository.findByStaffIdForList.mockResolvedValue([
        { id: 'group-other' } as GroupListRow,
      ]);

      await expect(
        useCase.execute(teacherId, UserRole.Teacher, membershipId),
      ).rejects.toThrow(ForbiddenException);
      expect(coverageRepository.findByMembershipId).not.toHaveBeenCalled();
    });

    it('throws the same uniform 403 for a non-existent membership (NFR-20)', async () => {
      membershipRepository.findScopeById.mockResolvedValue(null);

      await expect(
        useCase.execute(teacherId, UserRole.Teacher, membershipId),
      ).rejects.toThrow(ForbiddenException);
      expect(groupRepository.findByStaffIdForList).not.toHaveBeenCalled();
    });

    it('throws 403 for a malformed id without hitting the database', async () => {
      await expect(
        useCase.execute(teacherId, UserRole.Teacher, 'not-a-uuid'),
      ).rejects.toThrow(ForbiddenException);
      expect(membershipRepository.findScopeById).not.toHaveBeenCalled();
    });
  });

  describe('Admin', () => {
    it('returns any student coverage without a group check', async () => {
      membershipRepository.findScopeById.mockResolvedValue(membership);
      coverageRepository.findByMembershipId.mockResolvedValue(coverage);

      const result = await useCase.execute(
        adminId,
        UserRole.Admin,
        membershipId,
      );

      expect(groupRepository.findByStaffIdForList).not.toHaveBeenCalled();
      expect(result).toEqual(expectedPayload);
    });

    it('throws 404 NOT_FOUND for a non-existent membership', async () => {
      membershipRepository.findScopeById.mockResolvedValue(null);

      await expect(
        useCase.execute(adminId, UserRole.Admin, membershipId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 404 NOT_FOUND for a malformed id', async () => {
      await expect(
        useCase.execute(adminId, UserRole.Admin, 'not-a-uuid'),
      ).rejects.toThrow(NotFoundException);
      expect(membershipRepository.findScopeById).not.toHaveBeenCalled();
    });

    it('throws 404 NOT_FOUND when the membership has no live coverage (terminated)', async () => {
      membershipRepository.findScopeById.mockResolvedValue({
        ...membership,
        state: 'Terminated',
      });
      coverageRepository.findByMembershipId.mockResolvedValue(null);

      await expect(
        useCase.execute(adminId, UserRole.Admin, membershipId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it.each([UserRole.Assistant, UserRole.Student, UserRole.User])(
    'throws 403 for the %s role regardless of the membership',
    async (role) => {
      membershipRepository.findScopeById.mockResolvedValue(membership);

      await expect(
        useCase.execute('someone', role, membershipId),
      ).rejects.toThrow(ForbiddenException);
      expect(coverageRepository.findByMembershipId).not.toHaveBeenCalled();
    },
  );
});
