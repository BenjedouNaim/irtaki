/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GetJoinRequestDetailUseCase } from './get-join-request-detail.use-case';
import {
  IJoinRequestRepository,
  JOIN_REQUEST_REPOSITORY,
  JoinRequestDetailRow,
} from '../../domain/join-request.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';

describe('GetJoinRequestDetailUseCase', () => {
  let useCase: GetJoinRequestDetailUseCase;
  let mockRepository: jest.Mocked<IJoinRequestRepository>;

  const mockDetailRow: JoinRequestDetailRow = {
    id: '01916362-e61e-7f61-8270-b74e892c90c1',
    userId: 'user-1111-1111-1111-1111',
    groupId: 'group-2222-2222-2222-2222',
    fullName: 'أحمد التونسي',
    gender: 'Male',
    age: 26,
    phoneNumber: '+21698123456',
    occupation: 'مهندس برمجيات',
    city: 'تونس العاصمة',
    memorizedHizbCount: 15,
    memorizedAhzab: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    tajweedLevel: 'Intermediate',
    studiedTajweedTheory: true,
    studiedQalun: true,
    feeAgreement: true,
    programGoal: 'Memorization',
    score: 87.5,
    status: 'Pending',
    resolutionSource: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    deletedAt: null,
    assistantId: 'assistant-123',
  };

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      existsPendingForUser: jest.fn(),
      findLatestForUser: jest.fn(),
      findPendingQueue: jest.fn(),
      findByIdForDetail: jest.fn().mockResolvedValue(mockDetailRow),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetJoinRequestDetailUseCase,
        {
          provide: JOIN_REQUEST_REPOSITORY,
          useValue: mockRepository,
        },
      ],
    }).compile();

    useCase = module.get<GetJoinRequestDetailUseCase>(
      GetJoinRequestDetailUseCase,
    );
  });

  it('allows Admin to view any join request regardless of assistantId', async () => {
    const result = await useCase.execute(
      'admin-999',
      UserRole.Admin,
      mockDetailRow.id,
    );

    expect(mockRepository.findByIdForDetail).toHaveBeenCalledWith(
      mockDetailRow.id,
    );
    expect(result.data.id).toBe(mockDetailRow.id);
    expect(result.data.full_name).toBe('أحمد التونسي');
    expect(result.data.score).toBe(87.5);
  });

  it('allows Assistant to view join request for their assigned group', async () => {
    const result = await useCase.execute(
      'assistant-123',
      UserRole.Assistant,
      mockDetailRow.id,
    );

    expect(result.data.id).toBe(mockDetailRow.id);
    expect(result.data.full_name).toBe('أحمد التونسي');
    expect(result.data.memorized_ahzab).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('throws ForbiddenException when Assistant is not assigned to the group', async () => {
    await expect(
      useCase.execute(
        'other-assistant-456',
        UserRole.Assistant,
        mockDetailRow.id,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException (never NotFoundException) when record does not exist (NFR-20)', async () => {
    mockRepository.findByIdForDetail.mockResolvedValue(null);

    await expect(
      useCase.execute('assistant-123', UserRole.Assistant, 'non-existent-id'),
    ).rejects.toThrow(ForbiddenException);

    try {
      await useCase.execute(
        'assistant-123',
        UserRole.Assistant,
        'non-existent-id',
      );
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err).not.toBeInstanceOf(NotFoundException);
    }
  });

  it('throws ForbiddenException when record is soft-deleted', async () => {
    mockRepository.findByIdForDetail.mockResolvedValueOnce({
      ...mockDetailRow,
      deletedAt: new Date(),
    });

    await expect(
      useCase.execute('assistant-123', UserRole.Assistant, mockDetailRow.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns strictly allow-listed DTO fields and positively excludes email (APIQ-04)', async () => {
    const result = await useCase.execute(
      'assistant-123',
      UserRole.Assistant,
      mockDetailRow.id,
    );

    expect(result.data).toEqual({
      id: '01916362-e61e-7f61-8270-b74e892c90c1',
      full_name: 'أحمد التونسي',
      gender: 'Male',
      age: 26,
      phone_number: '+21698123456',
      occupation: 'مهندس برمجيات',
      city: 'تونس العاصمة',
      memorized_ahzab: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      tajweed_level: 'Intermediate',
      studied_tajweed_theory: true,
      studied_qalun: true,
      fee_agreement: true,
      program_goal: 'Memorization',
      score: 87.5,
      status: 'Pending',
      created_at: '2026-08-20T10:00:00.000Z',
    });

    const keys = Object.keys(result.data).sort();
    expect(keys).toEqual([
      'age',
      'city',
      'created_at',
      'fee_agreement',
      'full_name',
      'gender',
      'id',
      'memorized_ahzab',
      'occupation',
      'phone_number',
      'program_goal',
      'score',
      'status',
      'studied_qalun',
      'studied_tajweed_theory',
      'tajweed_level',
    ]);

    expect(
      (result.data as unknown as Record<string, unknown>).email,
    ).toBeUndefined();
  });
});
