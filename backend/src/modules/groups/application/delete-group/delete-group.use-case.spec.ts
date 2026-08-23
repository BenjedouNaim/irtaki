/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeleteGroupUseCase } from './delete-group.use-case';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
  GroupListRow,
} from '../../domain/group.repository.interface';

describe('DeleteGroupUseCase', () => {
  let useCase: DeleteGroupUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;

  const actorId = '11111111-1111-1111-1111-111111111111';
  const groupId = '22222222-2222-2222-2222-222222222222';

  const mockExistingGroup: GroupListRow = {
    id: groupId,
    name: 'حلقة قالون',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Closed',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-22T10:00:00Z'),
    teacher: {
      id: '33333333-3333-3333-3333-333333333333',
      full_name: 'الشيخ محمد',
    },
    assistant: {
      id: '44444444-4444-4444-4444-444444444444',
      full_name: 'الأستاذ أحمد',
    },
  };

  beforeEach(async () => {
    const mockGroupRepo: Partial<jest.Mocked<IGroupRepository>> = {
      findByIdForDetail: jest.fn(),
      hasMembershipHistory: jest.fn(),
      deleteById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteGroupUseCase,
        {
          provide: GROUP_REPOSITORY,
          useValue: mockGroupRepo,
        },
      ],
    }).compile();

    useCase = module.get<DeleteGroupUseCase>(DeleteGroupUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
  });

  it('throws NotFoundException (404) when group does not exist', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(null);

    await expect(useCase.execute(actorId, groupId)).rejects.toThrow(
      NotFoundException,
    );

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.hasMembershipHistory).not.toHaveBeenCalled();
    expect(groupRepository.deleteById).not.toHaveBeenCalled();
  });

  it('throws ConflictException (409 GROUP_HAS_HISTORY) when group has membership history', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    groupRepository.hasMembershipHistory.mockResolvedValueOnce(true);

    try {
      await useCase.execute(actorId, groupId);
      fail('Expected ConflictException');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      const res = (err as ConflictException).getResponse() as {
        statusCode: number;
        error: string;
        message: string;
      };
      expect(res.statusCode).toBe(409);
      expect(res.error).toBe('GROUP_HAS_HISTORY');
      expect(res.message).toBe('لا يمكن حذف حلقة سبق أن انضم إليها طلاب');
    }

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.hasMembershipHistory).toHaveBeenCalledWith(groupId);
    expect(groupRepository.deleteById).not.toHaveBeenCalled();
  });

  it('successfully deletes group and resolves void when group has no membership history', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    groupRepository.hasMembershipHistory.mockResolvedValueOnce(false);
    groupRepository.deleteById.mockResolvedValueOnce(true);

    await expect(useCase.execute(actorId, groupId)).resolves.toBeUndefined();

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.hasMembershipHistory).toHaveBeenCalledWith(groupId);
    expect(groupRepository.deleteById).toHaveBeenCalledWith(groupId);
  });

  it('throws NotFoundException (404) if group was deleted concurrently (deleteById returns false)', async () => {
    groupRepository.findByIdForDetail.mockResolvedValueOnce(mockExistingGroup);
    groupRepository.hasMembershipHistory.mockResolvedValueOnce(false);
    groupRepository.deleteById.mockResolvedValueOnce(false);

    await expect(useCase.execute(actorId, groupId)).rejects.toThrow(
      NotFoundException,
    );

    expect(groupRepository.findByIdForDetail).toHaveBeenCalledWith(groupId);
    expect(groupRepository.hasMembershipHistory).toHaveBeenCalledWith(groupId);
    expect(groupRepository.deleteById).toHaveBeenCalledWith(groupId);
  });
});
