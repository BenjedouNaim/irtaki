/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ToggleEnrollmentUseCase } from './toggle-enrollment.use-case';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
  GroupListRow,
} from '../../domain/group.repository.interface';
import { AuditEntryTypeOrmEntity } from '../../../identity/infrastructure/audit-entry.typeorm-entity';
import { ToggleEnrollmentDto } from './toggle-enrollment.dto';

describe('ToggleEnrollmentUseCase', () => {
  let useCase: ToggleEnrollmentUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;
  let auditRepository: jest.Mocked<Repository<AuditEntryTypeOrmEntity>>;

  const teacherId = '11111111-1111-1111-1111-111111111111';
  const otherTeacherId = '99999999-9999-9999-9999-999999999999';
  const groupId = '44444444-4444-4444-4444-444444444444';

  const mockOpenGroup: GroupListRow = {
    id: groupId,
    name: 'حلقة قالون',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-22T10:00:00Z'),
    teacher: {
      id: teacherId,
      full_name: 'الشيخ محمد',
    },
    assistant: {
      id: '22222222-2222-2222-2222-222222222222',
      full_name: 'الأستاذ أحمد',
    },
  };

  const mockClosedGroup: GroupListRow = {
    ...mockOpenGroup,
    enrollment_status: 'Closed',
  };

  const mockArchivedGroup: GroupListRow = {
    ...mockClosedGroup,
    lifecycle_state: 'Archived',
  };

  beforeEach(async () => {
    const mockGroupRepo: Partial<jest.Mocked<IGroupRepository>> = {
      findByIdForDetail: jest.fn(),
      updateEnrollmentStatus: jest.fn(),
    };

    const mockAuditRepo = {
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToggleEnrollmentUseCase,
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

    useCase = module.get<ToggleEnrollmentUseCase>(ToggleEnrollmentUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
    auditRepository = module.get(getRepositoryToken(AuditEntryTypeOrmEntity));
  });

  it('successfully toggles enrollment from Open to Closed by assigned teacher and records audit entry', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockOpenGroup);
    groupRepository.updateEnrollmentStatus.mockResolvedValueOnce(
      mockClosedGroup,
    );

    const dto: ToggleEnrollmentDto = { enrollment_status: 'Closed' };
    const result = await useCase.execute(teacherId, groupId, dto);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.updateEnrollmentStatus).toHaveBeenCalledWith(
      groupId,
      'Closed',
    );
    expect(auditRepository.save).toHaveBeenCalledTimes(1);
    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: teacherId,
        action: 'ENROLLMENT_TOGGLED',
        targetType: 'Group',
        targetId: groupId,
        previousValue: { enrollment_status: 'Open' },
        newValue: { enrollment_status: 'Closed' },
      }),
    );

    expect(result).toEqual({
      data: {
        id: mockClosedGroup.id,
        name: mockClosedGroup.name,
        gender: mockClosedGroup.gender,
        recitation_day: mockClosedGroup.recitation_day,
        enrollment_status: 'Closed',
        lifecycle_state: mockClosedGroup.lifecycle_state,
        teacher: mockClosedGroup.teacher,
        assistant: mockClosedGroup.assistant,
      },
    });
  });

  it('successfully toggles enrollment from Closed to Open by assigned teacher and records audit entry', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockClosedGroup);
    groupRepository.updateEnrollmentStatus.mockResolvedValueOnce(mockOpenGroup);

    const dto: ToggleEnrollmentDto = { enrollment_status: 'Open' };
    const result = await useCase.execute(teacherId, groupId, dto);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.updateEnrollmentStatus).toHaveBeenCalledWith(
      groupId,
      'Open',
    );
    expect(auditRepository.save).toHaveBeenCalledTimes(1);
    expect(auditRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: teacherId,
        action: 'ENROLLMENT_TOGGLED',
        targetType: 'Group',
        targetId: groupId,
        previousValue: { enrollment_status: 'Closed' },
        newValue: { enrollment_status: 'Open' },
      }),
    );

    expect(result.data.enrollment_status).toBe('Open');
  });

  it('throws ForbiddenException when group does not exist (masked 403)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(null);

    const dto: ToggleEnrollmentDto = { enrollment_status: 'Open' };
    await expect(useCase.execute(teacherId, groupId, dto)).rejects.toThrow(
      ForbiddenException,
    );

    expect(groupRepository.updateEnrollmentStatus).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when caller is not the assigned teacher', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockClosedGroup);

    const dto: ToggleEnrollmentDto = { enrollment_status: 'Open' };
    await expect(useCase.execute(otherTeacherId, groupId, dto)).rejects.toThrow(
      ForbiddenException,
    );

    expect(groupRepository.updateEnrollmentStatus).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('returns current state without updating DB or writing audit entry if group is Archived (BR-42 no-op)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockArchivedGroup);

    const dto: ToggleEnrollmentDto = { enrollment_status: 'Open' };
    const result = await useCase.execute(teacherId, groupId, dto);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.updateEnrollmentStatus).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();

    expect(result).toEqual({
      data: {
        id: mockArchivedGroup.id,
        name: mockArchivedGroup.name,
        gender: mockArchivedGroup.gender,
        recitation_day: mockArchivedGroup.recitation_day,
        enrollment_status: 'Closed',
        lifecycle_state: 'Archived',
        teacher: mockArchivedGroup.teacher,
        assistant: mockArchivedGroup.assistant,
      },
    });
  });

  it('succeeds even if audit repository fails to save (audit failure resilience)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockClosedGroup);
    groupRepository.updateEnrollmentStatus.mockResolvedValueOnce(mockOpenGroup);
    auditRepository.save.mockRejectedValueOnce(new Error('Audit DB error'));

    const dto: ToggleEnrollmentDto = { enrollment_status: 'Open' };
    const result = await useCase.execute(teacherId, groupId, dto);

    expect(result.data.enrollment_status).toBe('Open');
  });

  // TS §20 — the guarded UPDATE's 0-row outcome, which is the archival race
  // arriving after the step-3 read said the group was still Active.
  it('returns the BR-42 no-op when the group is archived between the read and the guarded update', async () => {
    groupRepository.findByIdForDetail
      .mockResolvedValueOnce(mockClosedGroup)
      .mockResolvedValueOnce(mockArchivedGroup);
    groupRepository.updateEnrollmentStatus.mockResolvedValueOnce(null);

    const dto: ToggleEnrollmentDto = { enrollment_status: 'Open' };
    const result = await useCase.execute(teacherId, groupId, dto);

    // The state the archival won, not the stale snapshot the toggle read.
    expect(result.data.enrollment_status).toBe('Closed');
    expect(result.data.lifecycle_state).toBe('Archived');
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the guarded update matches nothing and the group is gone', async () => {
    groupRepository.findByIdForDetail
      .mockResolvedValueOnce(mockClosedGroup)
      .mockResolvedValueOnce(null);
    groupRepository.updateEnrollmentStatus.mockResolvedValueOnce(null);

    const dto: ToggleEnrollmentDto = { enrollment_status: 'Open' };
    await expect(useCase.execute(teacherId, groupId, dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(auditRepository.save).not.toHaveBeenCalled();
  });
});
