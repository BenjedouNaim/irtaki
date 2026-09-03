/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateGroupUseCase } from './create-group.use-case';
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
import { User } from '../../../identity/domain/user.entity';
import { AuditEntryTypeOrmEntity } from '../../../identity/infrastructure/audit-entry.typeorm-entity';
import { CreateGroupDto } from './create-group.dto';

describe('CreateGroupUseCase', () => {
  let useCase: CreateGroupUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;
  let userRepository: jest.Mocked<IUserRepository>;
  let auditRepository: jest.Mocked<Repository<AuditEntryTypeOrmEntity>>;

  const mockTeacher = new User({
    id: '11111111-1111-1111-1111-111111111111',
    email: 'teacher@test.com',
    passwordHash: 'hash',
    role: UserRole.Teacher,
    fullName: 'الشيخ محمد',
    timezone: 'Africa/Tunis',
  });

  const mockAssistant = new User({
    id: '22222222-2222-2222-2222-222222222222',
    email: 'assistant@test.com',
    passwordHash: 'hash',
    role: UserRole.Assistant,
    fullName: 'الأستاذ أحمد',
    timezone: 'Africa/Tunis',
  });

  const mockStudent = new User({
    id: '33333333-3333-3333-3333-333333333333',
    email: 'student@test.com',
    passwordHash: 'hash',
    role: UserRole.Student,
    fullName: 'الطالب علي',
    timezone: 'Africa/Tunis',
  });

  const validDto: CreateGroupDto = {
    name: 'حلقة قالون النموذجية',
    gender: 'Male',
    recitation_day: 5,
    teacher_id: mockTeacher.id,
    assistant_id: mockAssistant.id,
  };

  const mockCreatedRow: GroupListRow = {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'حلقة قالون النموذجية',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Closed',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-22T10:00:00Z'),
    teacher: {
      id: mockTeacher.id,
      full_name: 'الشيخ محمد',
    },
    assistant: {
      id: mockAssistant.id,
      full_name: 'الأستاذ أحمد',
    },
  };

  beforeEach(async () => {
    const mockGroupRepo: Partial<jest.Mocked<IGroupRepository>> = {
      findByName: jest.fn(),
      create: jest.fn(),
      findByIdForDetail: jest.fn(),
    };

    const mockUserRepo: Partial<jest.Mocked<IUserRepository>> = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findPageByRole: jest.fn(),
      countByRole: jest.fn(),
      save: jest.fn(),
    };

    const mockAuditRepo = {
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateGroupUseCase,
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

    useCase = module.get<CreateGroupUseCase>(CreateGroupUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
    userRepository = module.get(USER_REPOSITORY);
    auditRepository = module.get(getRepositoryToken(AuditEntryTypeOrmEntity));
  });

  describe('Happy path', () => {
    it('creates group with enrollmentStatus=Closed and lifecycleState=Active and writes audit entry', async () => {
      userRepository.findById.mockImplementation((id: string) => {
        if (id === mockTeacher.id) return Promise.resolve(mockTeacher);
        if (id === mockAssistant.id) return Promise.resolve(mockAssistant);
        return Promise.resolve(null);
      });
      groupRepository.findByName.mockResolvedValue(null);
      groupRepository.create.mockResolvedValue(mockCreatedRow);

      const result = await useCase.execute('admin-id', validDto);

      expect(userRepository.findById).toHaveBeenCalledWith(mockTeacher.id);
      expect(userRepository.findById).toHaveBeenCalledWith(mockAssistant.id);
      expect(groupRepository.findByName).toHaveBeenCalledWith(
        'حلقة قالون النموذجية',
      );
      expect(groupRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'حلقة قالون النموذجية',
          gender: 'Male',
          recitationDay: 5,
          enrollmentStatus: 'Closed',
          lifecycleState: 'Active',
          teacherId: mockTeacher.id,
          assistantId: mockAssistant.id,
          createdBy: 'admin-id',
        }),
      );
      expect(auditRepository.save).toHaveBeenCalledTimes(1);
      const savedAudit = auditRepository.save.mock.calls[0][0];
      expect(savedAudit.action).toBe('GROUP_CREATED');
      expect(savedAudit.targetType).toBe('Group');
      expect(savedAudit.targetId).toBe(mockCreatedRow.id);
      expect(savedAudit.actorId).toBe('admin-id');
      expect(savedAudit.previousValue).toBeNull();
      expect(savedAudit.newValue).toMatchObject({
        name: 'حلقة قالون النموذجية',
        gender: 'Male',
        recitation_day: 5,
        enrollment_status: 'Closed',
        lifecycle_state: 'Active',
      });

      expect(result).toEqual({
        data: {
          id: mockCreatedRow.id,
          name: mockCreatedRow.name,
          gender: mockCreatedRow.gender,
          recitation_day: mockCreatedRow.recitation_day,
          enrollment_status: 'Closed',
          lifecycle_state: 'Active',
          teacher: mockCreatedRow.teacher,
          assistant: mockCreatedRow.assistant,
        },
      });
    });

    it('succeeds even if audit entry save fails (best-effort resilience)', async () => {
      userRepository.findById.mockImplementation((id: string) => {
        if (id === mockTeacher.id) return Promise.resolve(mockTeacher);
        if (id === mockAssistant.id) return Promise.resolve(mockAssistant);
        return Promise.resolve(null);
      });
      groupRepository.findByName.mockResolvedValue(null);
      groupRepository.create.mockResolvedValue(mockCreatedRow);
      auditRepository.save.mockRejectedValue(
        new Error('DB audit connection failure'),
      );

      const result = await useCase.execute('admin-id', validDto);

      expect(result.data.id).toBe(mockCreatedRow.id);
    });
  });

  describe('VR-24 Staff Role Validation', () => {
    it('throws 422 UnprocessableEntityException when teacher has wrong role', async () => {
      userRepository.findById.mockImplementation((id: string) => {
        if (id === mockTeacher.id) return Promise.resolve(mockStudent); // Wrong role!
        if (id === mockAssistant.id) return Promise.resolve(mockAssistant);
        return Promise.resolve(null);
      });

      await expect(useCase.execute('admin-id', validDto)).rejects.toThrow(
        UnprocessableEntityException,
      );

      try {
        await useCase.execute('admin-id', validDto);
      } catch (err) {
        const response = (
          err as UnprocessableEntityException
        ).getResponse() as {
          statusCode: number;
          details: Array<{ field: string; rule: string }>;
        };
        expect(response.statusCode).toBe(422);
        expect(response.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'teacher_id', rule: 'VR-24' }),
          ]),
        );
      }
    });

    it('throws 422 UnprocessableEntityException when assistant is not found', async () => {
      userRepository.findById.mockImplementation((id: string) => {
        if (id === mockTeacher.id) return Promise.resolve(mockTeacher);
        if (id === mockAssistant.id) return Promise.resolve(null); // Not found!
        return Promise.resolve(null);
      });

      await expect(useCase.execute('admin-id', validDto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('returns both errors in details when both staff members are invalid', async () => {
      userRepository.findById.mockResolvedValue(null);

      try {
        await useCase.execute('admin-id', validDto);
        fail('Expected UnprocessableEntityException');
      } catch (err) {
        const response = (
          err as UnprocessableEntityException
        ).getResponse() as {
          statusCode: number;
          details: Array<{ field: string; rule: string }>;
        };
        expect(response.statusCode).toBe(422);
        expect(response.details.length).toBe(2);
        expect(response.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'teacher_id', rule: 'VR-24' }),
            expect.objectContaining({ field: 'assistant_id', rule: 'VR-24' }),
          ]),
        );
      }
    });
  });

  describe('Duplicate Group Name & Concurrency', () => {
    it('throws 409 ConflictException when duplicate name found in pre-check', async () => {
      userRepository.findById.mockImplementation((id: string) => {
        if (id === mockTeacher.id) return Promise.resolve(mockTeacher);
        if (id === mockAssistant.id) return Promise.resolve(mockAssistant);
        return Promise.resolve(null);
      });
      groupRepository.findByName.mockResolvedValue(mockCreatedRow);

      await expect(useCase.execute('admin-id', validDto)).rejects.toThrow(
        ConflictException,
      );

      try {
        await useCase.execute('admin-id', validDto);
      } catch (err) {
        const response = (err as ConflictException).getResponse() as {
          statusCode: number;
          error: string;
        };
        expect(response.statusCode).toBe(409);
        expect(response.error).toBe('GROUP_NAME_TAKEN');
      }
    });

    it('translates 23505 Postgres unique violation error to 409 GROUP_NAME_TAKEN', async () => {
      userRepository.findById.mockImplementation((id: string) => {
        if (id === mockTeacher.id) return Promise.resolve(mockTeacher);
        if (id === mockAssistant.id) return Promise.resolve(mockAssistant);
        return Promise.resolve(null);
      });
      groupRepository.findByName.mockResolvedValue(null);
      groupRepository.create.mockRejectedValue({ code: '23505' });

      try {
        await useCase.execute('admin-id', validDto);
        fail('Expected ConflictException');
      } catch (err) {
        const response = (err as ConflictException).getResponse() as {
          statusCode: number;
          error: string;
        };
        expect(response.statusCode).toBe(409);
        expect(response.error).toBe('GROUP_NAME_TAKEN');
      }
    });
  });
});
