/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ArchiveGroupUseCase } from './archive-group.use-case';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
  GroupListRow,
} from '../../domain/group.repository.interface';
import { GroupArchivedEvent } from '../../domain/events/group-archived.event';

describe('ArchiveGroupUseCase', () => {
  let useCase: ArchiveGroupUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const adminId = '11111111-1111-1111-1111-111111111111';
  const groupId = '44444444-4444-4444-4444-444444444444';

  const mockActiveGroup: GroupListRow = {
    id: groupId,
    name: 'حلقة قالون',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-22T10:00:00Z'),
    teacher: {
      id: '22222222-2222-2222-2222-222222222222',
      full_name: 'الشيخ محمد',
    },
    assistant: {
      id: '33333333-3333-3333-3333-333333333333',
      full_name: 'الأستاذ أحمد',
    },
  };

  const mockArchivedGroup: GroupListRow = {
    ...mockActiveGroup,
    lifecycle_state: 'Archived',
  };

  beforeEach(async () => {
    const mockGroupRepo: Partial<jest.Mocked<IGroupRepository>> = {
      findByIdForDetail: jest.fn(),
      archiveWithPendingRejection: jest.fn(),
    };

    const mockEventEmitter: Partial<jest.Mocked<EventEmitter2>> = {
      emit: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArchiveGroupUseCase,
        {
          provide: GROUP_REPOSITORY,
          useValue: mockGroupRepo,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    useCase = module.get<ArchiveGroupUseCase>(ArchiveGroupUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
    eventEmitter = module.get(EventEmitter2);
  });

  it('throws NotFoundException when group does not exist', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(null);

    await expect(useCase.execute(adminId, groupId)).rejects.toThrow(
      NotFoundException,
    );
    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.archiveWithPendingRejection).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('returns current state without updating or emitting event when group is already Archived (BR-42 no-op)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockArchivedGroup);

    const result = await useCase.execute(adminId, groupId);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.archiveWithPendingRejection).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(result.data.lifecycle_state).toBe('Archived');
    expect(result.data.id).toBe(groupId);
  });

  it('successfully archives an Active group, emits GroupArchivedEvent, and returns updated DTO', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockActiveGroup);
    groupRepository.archiveWithPendingRejection.mockResolvedValueOnce({
      changed: true,
      group: mockArchivedGroup,
      autoRejectedRequestIds: [],
    });

    const result = await useCase.execute(adminId, groupId);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.archiveWithPendingRejection).toHaveBeenCalledWith(
      groupId,
      expect.any(Date),
    );
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      GroupArchivedEvent.EVENT_NAME,
      expect.objectContaining({
        groupId,
        archivedAt: expect.any(Date) as Date,
      }),
    );
    expect(result.data.lifecycle_state).toBe('Archived');
    expect(result.data.name).toBe('حلقة قالون');
  });

  it('carries the auto-rejected JoinRequest ids on DE-10 for the N-04 fan-out (FR-REQ-08)', async () => {
    const rejectedIds = [
      '55555555-5555-5555-5555-555555555555',
      '66666666-6666-6666-6666-666666666666',
    ];
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockActiveGroup);
    groupRepository.archiveWithPendingRejection.mockResolvedValueOnce({
      changed: true,
      group: mockArchivedGroup,
      autoRejectedRequestIds: rejectedIds,
    });

    await useCase.execute(adminId, groupId);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      GroupArchivedEvent.EVENT_NAME,
      expect.objectContaining({ autoRejectedJoinRequestIds: rejectedIds }),
    );
  });

  it('emits nothing when a concurrent Admin won the guarded UPDATE (BR-42 no-op)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockActiveGroup);
    groupRepository.archiveWithPendingRejection.mockResolvedValueOnce({
      changed: false,
      group: mockArchivedGroup,
      autoRejectedRequestIds: [],
    });

    const result = await useCase.execute(adminId, groupId);

    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(result.data.lifecycle_state).toBe('Archived');
  });

  it('throws NotFoundException when the group vanished before the archival transaction', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockActiveGroup);
    groupRepository.archiveWithPendingRejection.mockResolvedValueOnce({
      changed: false,
      group: null,
      autoRejectedRequestIds: [],
    });

    await expect(useCase.execute(adminId, groupId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('does not fail request if event emission throws an error', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockActiveGroup);
    groupRepository.archiveWithPendingRejection.mockResolvedValueOnce({
      changed: true,
      group: mockArchivedGroup,
      autoRejectedRequestIds: [],
    });
    eventEmitter.emit.mockImplementationOnce(() => {
      throw new Error('Event listener failed');
    });

    const result = await useCase.execute(adminId, groupId);

    expect(result.data.lifecycle_state).toBe('Archived');
  });
});
