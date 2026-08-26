/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException } from '@nestjs/common';
import { IMembershipRepository } from '../../domain/membership.repository.interface';
import {
  GroupListRow,
  IGroupRepository,
} from '../../../groups/domain/group.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { GetRosterUseCase } from './get-roster.use-case';

describe('GetRosterUseCase', () => {
  let useCase: GetRosterUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;
  let membershipRepository: jest.Mocked<IMembershipRepository>;

  const groupId = 'group-1';

  const assignedGroupRow = { id: groupId } as GroupListRow;

  const activeRosterRow = {
    id: 'membership-1',
    userId: 'student-1',
    fullName: 'الطالب أحمد',
    gender: 'Male',
    startedAt: '2026-01-01',
    state: 'Active' as const,
  };

  beforeEach(() => {
    groupRepository = {
      findByIdForDetail: jest.fn(),
      findByStaffIdForList: jest.fn(),
    } as unknown as jest.Mocked<IGroupRepository>;

    membershipRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findRosterByGroupId: jest.fn(),
    };

    useCase = new GetRosterUseCase(groupRepository, membershipRepository);
  });

  describe('Admin', () => {
    beforeEach(() => {
      groupRepository.findByIdForDetail.mockResolvedValue(assignedGroupRow);
    });

    it('fetches the roster directly and maps camelCase rows to the snake_case API-026 envelope', async () => {
      membershipRepository.findRosterByGroupId.mockResolvedValue([
        activeRosterRow,
        {
          id: 'membership-2',
          userId: 'student-2',
          fullName: null,
          gender: null,
          startedAt: '2026-02-01',
          state: 'Terminated',
        },
      ]);

      await expect(
        useCase.execute('admin-1', UserRole.Admin, groupId),
      ).resolves.toEqual({
        data: [
          {
            id: 'membership-1',
            user: { id: 'student-1', full_name: 'الطالب أحمد', gender: 'Male' },
            started_at: '2026-01-01',
            state: 'Active',
          },
          {
            id: 'membership-2',
            user: { id: 'student-2', full_name: null, gender: null },
            started_at: '2026-02-01',
            state: 'Terminated',
          },
        ],
      });

      expect(membershipRepository.findRosterByGroupId).toHaveBeenCalledWith(
        groupId,
        { asOf: undefined },
      );
      expect(groupRepository.findByStaffIdForList).not.toHaveBeenCalled();
    });

    it('passes as_of through to the repository', async () => {
      membershipRepository.findRosterByGroupId.mockResolvedValue([]);

      await useCase.execute('admin-1', UserRole.Admin, groupId, '2026-01-15');

      expect(membershipRepository.findRosterByGroupId).toHaveBeenCalledWith(
        groupId,
        { asOf: '2026-01-15' },
      );
    });

    it('returns an empty envelope when the group has no roster rows', async () => {
      membershipRepository.findRosterByGroupId.mockResolvedValue([]);

      await expect(
        useCase.execute('admin-1', UserRole.Admin, groupId),
      ).resolves.toEqual({ data: [] });
    });

    it('throws ForbiddenException for a nonexistent group (uniform-403 precedent)', async () => {
      groupRepository.findByIdForDetail.mockResolvedValue(null);

      await expect(
        useCase.execute('admin-1', UserRole.Admin, groupId),
      ).rejects.toThrow(ForbiddenException);

      expect(membershipRepository.findRosterByGroupId).not.toHaveBeenCalled();
    });
  });

  describe('Teacher scope', () => {
    it('proceeds when the group is assigned to the Teacher and returns the roster', async () => {
      groupRepository.findByStaffIdForList.mockResolvedValue([
        assignedGroupRow,
      ]);
      membershipRepository.findRosterByGroupId.mockResolvedValue([
        activeRosterRow,
      ]);

      await expect(
        useCase.execute('teacher-1', UserRole.Teacher, groupId),
      ).resolves.toEqual({
        data: [
          {
            id: 'membership-1',
            user: { id: 'student-1', full_name: 'الطالب أحمد', gender: 'Male' },
            started_at: '2026-01-01',
            state: 'Active',
          },
        ],
      });

      expect(groupRepository.findByStaffIdForList).toHaveBeenCalledWith(
        'teacher-1',
      );
      expect(membershipRepository.findRosterByGroupId).toHaveBeenCalledWith(
        groupId,
        { asOf: undefined },
      );
    });

    it('throws ForbiddenException without touching the roster when the group is not assigned to the Teacher', async () => {
      groupRepository.findByStaffIdForList.mockResolvedValue([
        { id: 'other-group' } as GroupListRow,
      ]);

      await expect(
        useCase.execute('teacher-1', UserRole.Teacher, groupId),
      ).rejects.toThrow(ForbiddenException);

      expect(membershipRepository.findRosterByGroupId).not.toHaveBeenCalled();
    });
  });

  describe('Assistant scope', () => {
    it('proceeds when the group is assigned to the Assistant and returns the roster', async () => {
      groupRepository.findByStaffIdForList.mockResolvedValue([
        assignedGroupRow,
      ]);
      membershipRepository.findRosterByGroupId.mockResolvedValue([
        activeRosterRow,
      ]);

      await expect(
        useCase.execute('assistant-1', UserRole.Assistant, groupId),
      ).resolves.toEqual({
        data: [
          {
            id: 'membership-1',
            user: { id: 'student-1', full_name: 'الطالب أحمد', gender: 'Male' },
            started_at: '2026-01-01',
            state: 'Active',
          },
        ],
      });

      expect(groupRepository.findByStaffIdForList).toHaveBeenCalledWith(
        'assistant-1',
      );
      expect(membershipRepository.findRosterByGroupId).toHaveBeenCalledWith(
        groupId,
        { asOf: undefined },
      );
    });

    it('throws ForbiddenException without touching the roster when the group is not assigned to the Assistant', async () => {
      groupRepository.findByStaffIdForList.mockResolvedValue([
        { id: 'other-group' } as GroupListRow,
      ]);

      await expect(
        useCase.execute('assistant-1', UserRole.Assistant, groupId),
      ).rejects.toThrow(ForbiddenException);

      expect(membershipRepository.findRosterByGroupId).not.toHaveBeenCalled();
    });
  });
});
