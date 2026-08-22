/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateGroupNameUseCase } from './update-group-name.use-case';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
  GroupListRow,
} from '../../domain/group.repository.interface';
import { AuditEntryTypeOrmEntity } from '../../../identity/infrastructure/audit-entry.typeorm-entity';
import { UpdateGroupNameDto } from './update-group-name.dto';

describe('UpdateGroupNameUseCase', () => {
  let useCase: UpdateGroupNameUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;
  let auditRepository: jest.Mocked<Repository<AuditEntryTypeOrmEntity>>;

  const mockExistingRow: GroupListRow = {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'حلقة قالون القديمة',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-22T10:00:00Z'),
    teacher: {
      id: '11111111-1111-1111-1111-111111111111',
      full_name: 'الشيخ محمد',
    },
    assistant: {
      id: '22222222-2222-2222-2222-222222222222',
      full_name: 'الأستاذ أحمد',
    },
  };

  const mockUpdatedRow: GroupListRow = {
    ...mockExistingRow,
    name: 'حلقة قالون الجديدة',
  };

  beforeEach(async () => {
    const mockGroupRepo: Partial<jest.Mocked<IGroupRepository>> = {
      findByIdForDetail: jest.fn(),
      findByName: jest.fn(),
      updateName: jest.fn(),
    };

    const mockAuditRepo = {
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateGroupNameUseCase,
        {
          provide: GROUP_REPOSITORY,
          useValue: mockGroupRepo,
        },
        {
          provide: getRepositoryToken(AuditEntryTypeOrmEntity),
          useValue: mockAuditRepo,
        },
      ],
    }).compile();

    useCase = module.get<UpdateGroupNameUseCase>(UpdateGroupNameUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
    auditRepository = module.get(getRepositoryToken(AuditEntryTypeOrmEntity));
  });

  const actorId = 'admin-user-id';
  const groupId = mockExistingRow.id;
  const validDto: UpdateGroupNameDto = {
    name: '  حلقة قالون الجديدة  ',
  };

  it('successfully updates group name, trims whitespace, writes audit entry, and returns updated group', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingRow);
    groupRepository.findByName.mockResolvedValueOnce(null);
    groupRepository.updateName.mockResolvedValueOnce(mockUpdatedRow);

    const result = await useCase.execute(actorId, groupId, validDto);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.findByName).toHaveBeenCalledWith(
      'حلقة قالون الجديدة',
    );
    expect(groupRepository.updateName).toHaveBeenCalledWith(
      groupId,
      'حلقة قالون الجديدة',
    );

    expect(result).toEqual({
      data: {
        id: mockUpdatedRow.id,
        name: 'حلقة قالون الجديدة',
        gender: mockUpdatedRow.gender,
        recitation_day: mockUpdatedRow.recitation_day,
        enrollment_status: mockUpdatedRow.enrollment_status,
        lifecycle_state: mockUpdatedRow.lifecycle_state,
        teacher: mockUpdatedRow.teacher,
        assistant: mockUpdatedRow.assistant,
      },
    });

    expect(auditRepository.save).toHaveBeenCalledTimes(1);
    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId,
        action: 'GROUP_NAME_UPDATED',
        targetType: 'Group',
        targetId: groupId,
        previousValue: { name: 'حلقة قالون القديمة' },
        newValue: { name: 'حلقة قالون الجديدة' },
      }),
    );
  });

  it('throws NotFoundException when group does not exist', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(null);

    await expect(
      useCase.execute(actorId, groupId, validDto),
    ).rejects.toThrow(NotFoundException);

    expect(groupRepository.updateName).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('throws ConflictException on fast-path duplicate name check when another group has that name', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingRow);
    groupRepository.findByName.mockResolvedValueOnce({
      ...mockExistingRow,
      id: 'different-group-id',
      name: 'حلقة قالون الجديدة',
    });

    await expect(
      useCase.execute(actorId, groupId, validDto),
    ).rejects.toThrow(ConflictException);

    expect(groupRepository.updateName).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('does not trigger fast-path conflict if the existing group already has that name (same id)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingRow);
    groupRepository.findByName.mockResolvedValueOnce(mockExistingRow);
    groupRepository.updateName.mockResolvedValueOnce(mockExistingRow);

    const result = await useCase.execute(actorId, groupId, {
      name: mockExistingRow.name,
    });

    expect(result.data.name).toBe(mockExistingRow.name);
    expect(groupRepository.updateName).toHaveBeenCalled();
  });

  it('throws ConflictException when updateName throws 23505 unique constraint violation', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingRow);
    groupRepository.findByName.mockResolvedValueOnce(null);
    groupRepository.updateName.mockRejectedValueOnce({
      code: '23505',
      driverError: { code: '23505' },
    });

    await expect(
      useCase.execute(actorId, groupId, validDto),
    ).rejects.toThrow(ConflictException);

    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundException if updateName returns null', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingRow);
    groupRepository.findByName.mockResolvedValueOnce(null);
    groupRepository.updateName.mockResolvedValueOnce(null);

    await expect(
      useCase.execute(actorId, groupId, validDto),
    ).rejects.toThrow(NotFoundException);
  });

  it('re-throws unexpected DB errors from updateName', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingRow);
    groupRepository.findByName.mockResolvedValueOnce(null);
    groupRepository.updateName.mockRejectedValueOnce(
      new Error('Connection lost'),
    );

    await expect(
      useCase.execute(actorId, groupId, validDto),
    ).rejects.toThrow('Connection lost');
  });

  it('continues and returns updated group if audit logging fails', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingRow);
    groupRepository.findByName.mockResolvedValueOnce(null);
    groupRepository.updateName.mockResolvedValueOnce(mockUpdatedRow);
    auditRepository.save.mockRejectedValueOnce(new Error('Audit DB down'));

    const result = await useCase.execute(actorId, groupId, validDto);

    expect(result.data.name).toBe('حلقة قالون الجديدة');
  });
});
