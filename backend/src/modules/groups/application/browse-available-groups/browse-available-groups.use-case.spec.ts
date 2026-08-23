/* eslint-disable @typescript-eslint/unbound-method */
import { UnprocessableEntityException } from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  GroupListRow,
  IGroupRepository,
} from '../../domain/group.repository.interface';
import { BrowseAvailableGroupsUseCase } from './browse-available-groups.use-case';

describe('BrowseAvailableGroupsUseCase', () => {
  let useCase: BrowseAvailableGroupsUseCase;
  let mockGroupRepo: jest.Mocked<IGroupRepository>;

  const sampleRow: GroupListRow = {
    id: 'grp-1',
    name: 'حلقة قالون 1',
    gender: 'Male',
    recitation_day: 3,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-01T10:00:00Z'),
    teacher: { id: 'teacher-1', full_name: 'الشيخ أحمد' },
    assistant: { id: 'assistant-1', full_name: 'الأستاذ علي' },
  };

  beforeEach(() => {
    mockGroupRepo = {
      findAllForList: jest.fn(),
      findByStaffIdForList: jest.fn(),
      findByActiveMemberForList: jest.fn(),
      findAvailableForGender: jest.fn(),
      findGenderByUserId: jest.fn(),
      findByIdForDetail: jest.fn(),
      findByActiveMemberAndGroupId: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      updateName: jest.fn(),
      updateEnrollmentStatus: jest.fn(),
      updateStaff: jest.fn(),
      updateLifecycle: jest.fn(),
      hasMembershipHistory: jest.fn(),
      deleteById: jest.fn(),
    };
    useCase = new BrowseAvailableGroupsUseCase(mockGroupRepo);
  });

  describe('User role', () => {
    it('returns available groups when valid queryGender Male is provided', async () => {
      mockGroupRepo.findAvailableForGender.mockResolvedValue([sampleRow]);

      const result = await useCase.execute('user-1', UserRole.User, 'Male');

      expect(mockGroupRepo.findAvailableForGender).toHaveBeenCalledWith('Male');
      expect(mockGroupRepo.findGenderByUserId).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: [
          {
            id: 'grp-1',
            name: 'حلقة قالون 1',
            recitation_day: 3,
            enrollment_status: 'Open',
          },
        ],
      });
    });

    it('returns available groups when valid queryGender Female is provided', async () => {
      const femaleRow: GroupListRow = {
        ...sampleRow,
        id: 'grp-2',
        name: 'حلقة خديجة',
        gender: 'Female',
      };
      mockGroupRepo.findAvailableForGender.mockResolvedValue([femaleRow]);

      const result = await useCase.execute('user-2', UserRole.User, 'Female');

      expect(mockGroupRepo.findAvailableForGender).toHaveBeenCalledWith(
        'Female',
      );
      expect(result).toEqual({
        data: [
          {
            id: 'grp-2',
            name: 'حلقة خديجة',
            recitation_day: 3,
            enrollment_status: 'Open',
          },
        ],
      });
    });

    it('throws 422 GENDER_REQUIRED when queryGender is missing for User', async () => {
      await expect(
        useCase.execute('user-1', UserRole.User, undefined),
      ).rejects.toThrow(UnprocessableEntityException);

      try {
        await useCase.execute('user-1', UserRole.User, undefined);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const exception = err as UnprocessableEntityException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(response).toMatchObject({
          statusCode: 422,
          error: 'GENDER_REQUIRED',
        });
      }
      expect(mockGroupRepo.findAvailableForGender).not.toHaveBeenCalled();
    });

    it('throws 422 GENDER_REQUIRED when queryGender is invalid for User', async () => {
      await expect(
        useCase.execute('user-1', UserRole.User, 'Invalid'),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockGroupRepo.findAvailableForGender).not.toHaveBeenCalled();
    });
  });

  describe('Non-User roles (session-derived gender)', () => {
    it('Student ignores mismatched queryGender and uses stored gender', async () => {
      mockGroupRepo.findGenderByUserId.mockResolvedValue('Male');
      mockGroupRepo.findAvailableForGender.mockResolvedValue([sampleRow]);

      const result = await useCase.execute(
        'student-1',
        UserRole.Student,
        'Female',
      );

      expect(mockGroupRepo.findGenderByUserId).toHaveBeenCalledWith(
        'student-1',
      );
      expect(mockGroupRepo.findAvailableForGender).toHaveBeenCalledWith('Male');
      expect(result).toEqual({
        data: [
          {
            id: 'grp-1',
            name: 'حلقة قالون 1',
            recitation_day: 3,
            enrollment_status: 'Open',
          },
        ],
      });
    });

    it('returns empty data when non-User caller has null stored gender', async () => {
      mockGroupRepo.findGenderByUserId.mockResolvedValue(null);

      const result = await useCase.execute('admin-1', UserRole.Admin, 'Male');

      expect(mockGroupRepo.findGenderByUserId).toHaveBeenCalledWith('admin-1');
      expect(mockGroupRepo.findAvailableForGender).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [] });
    });

    it('returns groups when Teacher has stored gender', async () => {
      const femaleRow: GroupListRow = {
        ...sampleRow,
        id: 'grp-female',
        gender: 'Female',
      };
      mockGroupRepo.findGenderByUserId.mockResolvedValue('Female');
      mockGroupRepo.findAvailableForGender.mockResolvedValue([femaleRow]);

      const result = await useCase.execute('teacher-1', UserRole.Teacher);

      expect(mockGroupRepo.findGenderByUserId).toHaveBeenCalledWith(
        'teacher-1',
      );
      expect(mockGroupRepo.findAvailableForGender).toHaveBeenCalledWith(
        'Female',
      );
      expect(result.data).toHaveLength(1);
    });
  });
});
