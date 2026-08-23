/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UnarchiveGroupUseCase } from './unarchive-group.use-case';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
  GroupListRow,
} from '../../domain/group.repository.interface';

describe('UnarchiveGroupUseCase', () => {
  let useCase: UnarchiveGroupUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;

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
      updateLifecycle: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnarchiveGroupUseCase,
        {
          provide: GROUP_REPOSITORY,
          useValue: mockGroupRepo,
        },
      ],
    }).compile();

    useCase = module.get<UnarchiveGroupUseCase>(UnarchiveGroupUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
  });

  it('throws NotFoundException when group does not exist', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(null);

    await expect(useCase.execute(adminId, groupId)).rejects.toThrow(
      NotFoundException,
    );
    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.updateLifecycle).not.toHaveBeenCalled();
  });

  it('returns current state without updating when group is already Active (BR-42 no-op)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockActiveGroup);

    const result = await useCase.execute(adminId, groupId);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.updateLifecycle).not.toHaveBeenCalled();
    expect(result.data.lifecycle_state).toBe('Active');
    expect(result.data.id).toBe(groupId);
  });

  it('successfully un-archives an Archived group and returns updated DTO', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockArchivedGroup);
    groupRepository.updateLifecycle.mockResolvedValueOnce(mockActiveGroup);

    const result = await useCase.execute(adminId, groupId);

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.updateLifecycle).toHaveBeenCalledWith(
      groupId,
      'Active',
      null,
    );
    expect(result.data.lifecycle_state).toBe('Active');
    expect(result.data.name).toBe('حلقة قالون');
  });
});
