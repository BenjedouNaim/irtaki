/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { GetOwnJoinRequestUseCase } from './get-own-join-request-status.use-case';
import {
  IJoinRequestRepository,
  JoinRequestRecord,
} from '../../domain/join-request.repository.interface';

describe('GetOwnJoinRequestUseCase', () => {
  let useCase: GetOwnJoinRequestUseCase;
  let mockJoinRequestRepo: jest.Mocked<IJoinRequestRepository>;

  const mockRecord: JoinRequestRecord = {
    id: 'req-uuid-1',
    userId: 'user-uuid-1',
    groupId: 'grp-uuid-1',
    fullName: 'طالب العلم',
    gender: 'Male',
    age: 22,
    phoneNumber: '+21698123456',
    occupation: 'مهندس',
    city: 'تونس',
    memorizedHizbCount: 15,
    tajweedLevel: 'Intermediate',
    studiedTajweedTheory: true,
    studiedQalun: true,
    feeAgreement: true,
    programGoal: 'Memorization',
    score: 85.5,
    status: 'Pending',
    resolutionSource: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: new Date('2026-08-23T10:00:00Z'),
    deletedAt: null,
  };

  beforeEach(() => {
    mockJoinRequestRepo = {
      create: jest.fn(),
      existsPendingForUser: jest.fn(),
      findLatestForUser: jest.fn(),
      findByIdForDetail: jest.fn(),
      findPendingQueue: jest.fn(),
      acceptConditionally: jest.fn(),
    };

    useCase = new GetOwnJoinRequestUseCase(mockJoinRequestRepo);
  });

  it('throws NotFoundException (404) when user has no join request', async () => {
    mockJoinRequestRepo.findLatestForUser.mockResolvedValue(null);

    await expect(useCase.execute('user-uuid-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockJoinRequestRepo.findLatestForUser).toHaveBeenCalledWith(
      'user-uuid-1',
    );
  });

  it('returns { data: { status: "Pending" } } with exactly one key in data (no score or profile leak)', async () => {
    mockJoinRequestRepo.findLatestForUser.mockResolvedValue({
      ...mockRecord,
      status: 'Pending',
    });

    const result = await useCase.execute('user-uuid-1');

    expect(result).toEqual({
      data: {
        status: 'Pending',
      },
    });
    expect(Object.keys(result.data)).toEqual(['status']);
  });

  it('returns { data: { status: "Rejected" } } with exactly one key in data', async () => {
    mockJoinRequestRepo.findLatestForUser.mockResolvedValue({
      ...mockRecord,
      status: 'Rejected',
    });

    const result = await useCase.execute('user-uuid-1');

    expect(result).toEqual({
      data: {
        status: 'Rejected',
      },
    });
    expect(Object.keys(result.data)).toEqual(['status']);
  });

  it('returns { data: { status: "Accepted" } } with exactly one key in data', async () => {
    mockJoinRequestRepo.findLatestForUser.mockResolvedValue({
      ...mockRecord,
      status: 'Accepted',
    });

    const result = await useCase.execute('user-uuid-1');

    expect(result).toEqual({
      data: {
        status: 'Accepted',
      },
    });
    expect(Object.keys(result.data)).toEqual(['status']);
  });
});
