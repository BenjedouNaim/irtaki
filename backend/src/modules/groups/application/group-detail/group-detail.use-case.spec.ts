/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { GroupDetailUseCase } from './group-detail.use-case';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
  GroupListRow,
} from '../../domain/group.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';

describe('GroupDetailUseCase', () => {
  let useCase: GroupDetailUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;

  const mockGroupRow: GroupListRow = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'حلقة الإمام قالون',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-20T10:00:00Z'),
    teacher: {
      id: '22222222-2222-2222-2222-222222222222',
      full_name: 'الشيخ محمد',
    },
    assistant: {
      id: '33333333-3333-3333-3333-333333333333',
      full_name: 'الأستاذ أحمد',
    },
  };

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<IGroupRepository>> = {
      findAllForList: jest.fn(),
      countAll: jest.fn(),
      findByStaffIdForList: jest.fn(),
      findByActiveMemberForList: jest.fn(),
      findAvailableForGender: jest.fn(),
      findGenderByUserId: jest.fn(),
      findByIdForDetail: jest.fn(),
      findByActiveMemberAndGroupId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupDetailUseCase,
        {
          provide: GROUP_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    useCase = module.get<GroupDetailUseCase>(GroupDetailUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
  });

  describe('Admin role', () => {
    it('should return full group detail for Admin when group exists', async () => {
      groupRepository.findByIdForDetail.mockResolvedValue(mockGroupRow);

      const result = await useCase.execute(
        'admin-id',
        UserRole.Admin,
        mockGroupRow.id,
      );

      expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(
        mockGroupRow.id,
      );
      expect(result).toEqual({
        data: {
          id: mockGroupRow.id,
          name: mockGroupRow.name,
          gender: mockGroupRow.gender,
          recitation_day: mockGroupRow.recitation_day,
          enrollment_status: mockGroupRow.enrollment_status,
          lifecycle_state: mockGroupRow.lifecycle_state,
          teacher: {
            id: mockGroupRow.teacher.id,
            full_name: mockGroupRow.teacher.full_name,
          },
          assistant: {
            id: mockGroupRow.assistant.id,
            full_name: mockGroupRow.assistant.full_name,
          },
        },
      });
    });

    it('should throw ForbiddenException when group does not exist (NFR-20)', async () => {
      groupRepository.findByIdForDetail.mockResolvedValue(null);

      await expect(
        useCase.execute('admin-id', UserRole.Admin, 'nonexistent-id'),
      ).rejects.toThrow(ForbiddenException);

      expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(
        'nonexistent-id',
      );
    });
  });

  describe('Teacher role', () => {
    it('should return full group detail for Teacher when assigned to group', async () => {
      groupRepository.findByStaffIdForList.mockResolvedValue([mockGroupRow]);

      const result = await useCase.execute(
        'teacher-id',
        UserRole.Teacher,
        mockGroupRow.id,
      );

      expect(groupRepository.findByStaffIdForList).toHaveBeenCalledWith(
        'teacher-id',
      );
      expect(result).toEqual({
        data: {
          id: mockGroupRow.id,
          name: mockGroupRow.name,
          gender: mockGroupRow.gender,
          recitation_day: mockGroupRow.recitation_day,
          enrollment_status: mockGroupRow.enrollment_status,
          lifecycle_state: mockGroupRow.lifecycle_state,
          teacher: {
            id: mockGroupRow.teacher.id,
            full_name: mockGroupRow.teacher.full_name,
          },
          assistant: {
            id: mockGroupRow.assistant.id,
            full_name: mockGroupRow.assistant.full_name,
          },
        },
      });
    });

    it('should throw ForbiddenException when group is not assigned to Teacher', async () => {
      groupRepository.findByStaffIdForList.mockResolvedValue([mockGroupRow]);

      await expect(
        useCase.execute('teacher-id', UserRole.Teacher, 'other-group-id'),
      ).rejects.toThrow(ForbiddenException);

      expect(groupRepository.findByStaffIdForList).toHaveBeenCalledWith(
        'teacher-id',
      );
    });
  });

  describe('Assistant role', () => {
    it('should return full group detail for Assistant when assigned to group', async () => {
      groupRepository.findByStaffIdForList.mockResolvedValue([mockGroupRow]);

      const result = await useCase.execute(
        'assistant-id',
        UserRole.Assistant,
        mockGroupRow.id,
      );

      expect(groupRepository.findByStaffIdForList).toHaveBeenCalledWith(
        'assistant-id',
      );
      expect(result.data).toHaveProperty('teacher');
      expect(result.data).toHaveProperty('assistant');
    });

    it('should throw ForbiddenException when group is not assigned to Assistant', async () => {
      groupRepository.findByStaffIdForList.mockResolvedValue([]);

      await expect(
        useCase.execute('assistant-id', UserRole.Assistant, mockGroupRow.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Student role', () => {
    it('should return limited DTO for Student with active membership in the group', async () => {
      groupRepository.findByActiveMemberAndGroupId.mockResolvedValue(
        mockGroupRow,
      );

      const result = await useCase.execute(
        'student-id',
        UserRole.Student,
        mockGroupRow.id,
      );

      expect(groupRepository.findByActiveMemberAndGroupId).toHaveBeenCalledWith(
        'student-id',
        mockGroupRow.id,
      );

      expect(result).toEqual({
        data: {
          id: mockGroupRow.id,
          name: mockGroupRow.name,
          recitation_day: mockGroupRow.recitation_day,
          enrollment_status: mockGroupRow.enrollment_status,
        },
      });

      // Verify restricted fields are absent
      expect(result.data).not.toHaveProperty('teacher');
      expect(result.data).not.toHaveProperty('assistant');
      expect(result.data).not.toHaveProperty('gender');
      expect(result.data).not.toHaveProperty('lifecycle_state');
    });

    it('should throw ForbiddenException when Student is not an active member of the requested group', async () => {
      groupRepository.findByActiveMemberAndGroupId.mockResolvedValue(null);

      await expect(
        useCase.execute('student-id', UserRole.Student, 'other-group-id'),
      ).rejects.toThrow(ForbiddenException);

      expect(groupRepository.findByActiveMemberAndGroupId).toHaveBeenCalledWith(
        'student-id',
        'other-group-id',
      );
    });
  });

  describe('User role and default', () => {
    it('should throw ForbiddenException for User without calling repository', async () => {
      await expect(
        useCase.execute('user-id', UserRole.User, mockGroupRow.id),
      ).rejects.toThrow(ForbiddenException);

      expect(groupRepository.findByIdForDetail).not.toHaveBeenCalled();
      expect(groupRepository.findByStaffIdForList).not.toHaveBeenCalled();
      expect(
        groupRepository.findByActiveMemberAndGroupId,
      ).not.toHaveBeenCalled();
    });
  });
});
