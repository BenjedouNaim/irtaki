/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReassignStaffUseCase } from './reassign-staff.use-case';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
  GroupListRow,
} from '../../domain/group.repository.interface';
import {
  USER_REPOSITORY,
  IUserRepository,
} from '../../../identity/domain/user.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { AuditEntryTypeOrmEntity } from '../../../identity/infrastructure/audit-entry.typeorm-entity';
import { ReassignStaffDto } from './reassign-staff.dto';

describe('ReassignStaffUseCase', () => {
  let useCase: ReassignStaffUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;
  let userRepository: jest.Mocked<IUserRepository>;
  let auditRepository: jest.Mocked<Repository<AuditEntryTypeOrmEntity>>;

  const adminId = '11111111-1111-1111-1111-111111111111';
  const groupId = '22222222-2222-2222-2222-222222222222';

  const currentTeacherId = '33333333-3333-3333-3333-333333333333';
  const currentAssistantId = '44444444-4444-4444-4444-444444444444';

  const newTeacherId = '55555555-5555-5555-5555-555555555555';
  const newAssistantId = '66666666-6666-6666-6666-666666666666';

  const mockExistingGroup: GroupListRow = {
    id: groupId,
    name: 'حلقة قالون',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Closed',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-22T10:00:00Z'),
    teacher: {
      id: currentTeacherId,
      full_name: 'الشيخ محمد الحالي',
    },
    assistant: {
      id: currentAssistantId,
      full_name: 'الأستاذ أحمد الحالي',
    },
  };

  const mockNewTeacherUser = {
    id: newTeacherId,
    email: 'new-teacher@test.com',
    fullName: 'الشيخ الجديد',
    role: UserRole.Teacher,
    gender: 'Male' as const,
    passwordHash: 'hash',
    timezone: 'Africa/Tunis',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockNewAssistantUser = {
    id: newAssistantId,
    email: 'new-assistant@test.com',
    fullName: 'المساعد الجديد',
    role: UserRole.Assistant,
    gender: 'Male' as const,
    passwordHash: 'hash',
    timezone: 'Africa/Tunis',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockGroupRepo: Partial<jest.Mocked<IGroupRepository>> = {
      findByIdForDetail: jest.fn(),
      updateStaff: jest.fn(),
    };

    const mockUserRepo: Partial<jest.Mocked<IUserRepository>> = {
      findById: jest.fn(),
    };

    const mockAuditRepo = {
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReassignStaffUseCase,
        {
          provide: GROUP_REPOSITORY,
          useValue: mockGroupRepo,
        },
        {
          provide: USER_REPOSITORY,
          useValue: mockUserRepo,
        },
        {
          provide: getRepositoryToken(AuditEntryTypeOrmEntity),
          useValue: mockAuditRepo,
        },
      ],
    }).compile();

    useCase = module.get<ReassignStaffUseCase>(ReassignStaffUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
    userRepository = module.get(USER_REPOSITORY);
    auditRepository = module.get(getRepositoryToken(AuditEntryTypeOrmEntity));
  });

  it('successfully swaps both teacher and assistant and records audit entry', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    userRepository.findById
      .mockResolvedValueOnce(mockNewTeacherUser)
      .mockResolvedValueOnce(mockNewAssistantUser);

    const updatedGroup: GroupListRow = {
      ...mockExistingGroup,
      teacher: { id: newTeacherId, full_name: 'الشيخ الجديد' },
      assistant: { id: newAssistantId, full_name: 'المساعد الجديد' },
    };
    groupRepository.updateStaff.mockResolvedValueOnce(updatedGroup);

    const dto: ReassignStaffDto = {
      teacher_id: newTeacherId,
      assistant_id: newAssistantId,
    };

    const result = await useCase.execute(adminId, groupId, dto);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(userRepository.findById).toHaveBeenCalledWith(newTeacherId);
    expect(userRepository.findById).toHaveBeenCalledWith(newAssistantId);
    expect(groupRepository.updateStaff).toHaveBeenCalledWith(groupId, {
      teacherId: newTeacherId,
      assistantId: newAssistantId,
    });

    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        action: 'STAFF_REASSIGNED',
        targetType: 'Group',
        targetId: groupId,
        previousValue: {
          teacher_id: currentTeacherId,
          assistant_id: currentAssistantId,
        },
        newValue: {
          teacher_id: newTeacherId,
          assistant_id: newAssistantId,
        },
      }),
    );

    expect(result).toEqual({
      data: {
        id: updatedGroup.id,
        name: updatedGroup.name,
        gender: updatedGroup.gender,
        recitation_day: updatedGroup.recitation_day,
        enrollment_status: updatedGroup.enrollment_status,
        lifecycle_state: updatedGroup.lifecycle_state,
        teacher: updatedGroup.teacher,
        assistant: updatedGroup.assistant,
      },
    });
  });

  it('successfully swaps only teacher (partial swap) and writes audit for teacher only', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    userRepository.findById.mockResolvedValueOnce(mockNewTeacherUser);

    const updatedGroup: GroupListRow = {
      ...mockExistingGroup,
      teacher: { id: newTeacherId, full_name: 'الشيخ الجديد' },
    };
    groupRepository.updateStaff.mockResolvedValueOnce(updatedGroup);

    const dto: ReassignStaffDto = {
      teacher_id: newTeacherId,
    };

    const result = await useCase.execute(adminId, groupId, dto);

    expect(groupRepository.updateStaff).toHaveBeenCalledWith(groupId, {
      teacherId: newTeacherId,
    });

    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        action: 'STAFF_REASSIGNED',
        targetType: 'Group',
        targetId: groupId,
        previousValue: {
          teacher_id: currentTeacherId,
        },
        newValue: {
          teacher_id: newTeacherId,
        },
      }),
    );

    expect(result.data.teacher.id).toBe(newTeacherId);
    expect(result.data.assistant.id).toBe(currentAssistantId);
  });

  it('successfully swaps only assistant (partial swap) and writes audit for assistant only', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    userRepository.findById.mockResolvedValueOnce(mockNewAssistantUser);

    const updatedGroup: GroupListRow = {
      ...mockExistingGroup,
      assistant: { id: newAssistantId, full_name: 'المساعد الجديد' },
    };
    groupRepository.updateStaff.mockResolvedValueOnce(updatedGroup);

    const dto: ReassignStaffDto = {
      assistant_id: newAssistantId,
    };

    const result = await useCase.execute(adminId, groupId, dto);

    expect(groupRepository.updateStaff).toHaveBeenCalledWith(groupId, {
      assistantId: newAssistantId,
    });

    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        action: 'STAFF_REASSIGNED',
        targetType: 'Group',
        targetId: groupId,
        previousValue: {
          assistant_id: currentAssistantId,
        },
        newValue: {
          assistant_id: newAssistantId,
        },
      }),
    );

    expect(result.data.assistant.id).toBe(newAssistantId);
    expect(result.data.teacher.id).toBe(currentTeacherId);
  });

  it('throws NotFoundException when group does not exist (404)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(null);

    const dto: ReassignStaffDto = {
      teacher_id: newTeacherId,
    };

    await expect(useCase.execute(adminId, groupId, dto)).rejects.toThrow(
      NotFoundException,
    );

    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(groupRepository.updateStaff).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException when neither teacher_id nor assistant_id is provided', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);

    const dto: ReassignStaffDto = {};

    await expect(useCase.execute(adminId, groupId, dto)).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(groupRepository.updateStaff).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException (422 VR-24) when both users have invalid roles without short-circuiting', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);

    const invalidTeacher = {
      ...mockNewTeacherUser,
      role: UserRole.Student, // Not Teacher
    };
    const invalidAssistant = {
      ...mockNewAssistantUser,
      role: UserRole.User, // Not Assistant
    };

    userRepository.findById
      .mockResolvedValueOnce(invalidTeacher)
      .mockResolvedValueOnce(invalidAssistant);

    const dto: ReassignStaffDto = {
      teacher_id: newTeacherId,
      assistant_id: newAssistantId,
    };

    try {
      await useCase.execute(adminId, groupId, dto);
      fail('Should have thrown UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const res = (err as UnprocessableEntityException).getResponse() as {
        statusCode: number;
        error: string;
        details: Array<{ field: string; rule: string }>;
      };
      expect(res.statusCode).toBe(422);
      expect(res.error).toBe('VALIDATION_ERROR');
      expect(res.details).toHaveLength(2);
      expect(res.details.map((d) => d.field)).toEqual([
        'teacher_id',
        'assistant_id',
      ]);
      expect(res.details.map((d) => d.rule)).toEqual(['VR-24', 'VR-24']);
    }

    expect(groupRepository.updateStaff).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException (422 VR-24) when user is not found in database', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    userRepository.findById.mockResolvedValueOnce(null);

    const dto: ReassignStaffDto = {
      teacher_id: newTeacherId,
    };

    await expect(useCase.execute(adminId, groupId, dto)).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(groupRepository.updateStaff).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('returns 200 no-op without repository write or audit write when reassigning to same users', async () => {
    const currentTeacherUser = {
      ...mockNewTeacherUser,
      id: currentTeacherId,
      role: UserRole.Teacher,
    };
    const currentAssistantUser = {
      ...mockNewAssistantUser,
      id: currentAssistantId,
      role: UserRole.Assistant,
    };

    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    userRepository.findById
      .mockResolvedValueOnce(currentTeacherUser)
      .mockResolvedValueOnce(currentAssistantUser);

    const dto: ReassignStaffDto = {
      teacher_id: currentTeacherId,
      assistant_id: currentAssistantId,
    };

    const result = await useCase.execute(adminId, groupId, dto);

    expect(groupRepository.updateStaff).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();

    expect(result).toEqual({
      data: {
        id: mockExistingGroup.id,
        name: mockExistingGroup.name,
        gender: mockExistingGroup.gender,
        recitation_day: mockExistingGroup.recitation_day,
        enrollment_status: mockExistingGroup.enrollment_status,
        lifecycle_state: mockExistingGroup.lifecycle_state,
        teacher: mockExistingGroup.teacher,
        assistant: mockExistingGroup.assistant,
      },
    });
  });

  it('returns 200 no-op when single provided field matches current holder', async () => {
    const currentTeacherUser = {
      ...mockNewTeacherUser,
      id: currentTeacherId,
      role: UserRole.Teacher,
    };

    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    userRepository.findById.mockResolvedValueOnce(currentTeacherUser);

    const dto: ReassignStaffDto = {
      teacher_id: currentTeacherId,
    };

    const result = await useCase.execute(adminId, groupId, dto);

    expect(groupRepository.updateStaff).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
    expect(result.data.teacher.id).toBe(currentTeacherId);
  });

  it('succeeds even if audit repository fails to save (audit write resilience)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    userRepository.findById.mockResolvedValueOnce(mockNewTeacherUser);

    const updatedGroup: GroupListRow = {
      ...mockExistingGroup,
      teacher: { id: newTeacherId, full_name: 'الشيخ الجديد' },
    };
    groupRepository.updateStaff.mockResolvedValueOnce(updatedGroup);
    auditRepository.save.mockRejectedValueOnce(new Error('Audit DB failure'));

    const dto: ReassignStaffDto = {
      teacher_id: newTeacherId,
    };

    const result = await useCase.execute(adminId, groupId, dto);

    expect(result.data.teacher.id).toBe(newTeacherId);
  });

  it('throws NotFoundException if updateStaff returns null', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    userRepository.findById.mockResolvedValueOnce(mockNewTeacherUser);
    groupRepository.updateStaff.mockResolvedValueOnce(null);

    const dto: ReassignStaffDto = {
      teacher_id: newTeacherId,
    };

    await expect(useCase.execute(adminId, groupId, dto)).rejects.toThrow(
      NotFoundException,
    );
  });
});
