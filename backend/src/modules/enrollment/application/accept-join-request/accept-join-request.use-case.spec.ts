/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { IUserRepository } from '../../../identity/domain/user.repository.interface';
import { IMembershipRepository } from '../../../memberships/domain/membership.repository.interface';
import { ICoverageRepository } from '../../../progress/domain/coverage.repository.interface';
import {
  IJoinRequestRepository,
  JoinRequestDetailRow,
} from '../../domain/join-request.repository.interface';
import { JoinRequestAcceptedEvent } from '../../domain/events/join-request-accepted.event';
import { AcceptJoinRequestUseCase } from './accept-join-request.use-case';

describe('AcceptJoinRequestUseCase (Unit)', () => {
  let useCase: AcceptJoinRequestUseCase;
  let mockJoinRequestRepo: jest.Mocked<IJoinRequestRepository>;
  let mockMembershipRepo: jest.Mocked<IMembershipRepository>;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockCoverageRepo: jest.Mocked<ICoverageRepository>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;
  let mockManager: jest.Mocked<EntityManager>;

  const mockDetailRow: JoinRequestDetailRow = {
    id: 'jr-1111-1111-1111-1111',
    userId: 'user-2222-2222-2222-2222',
    groupId: 'group-3333-3333-3333-3333',
    fullName: 'أحمد التونسي',
    gender: 'Male',
    age: 25,
    phoneNumber: '+21698123456',
    occupation: 'مهندس برمجيات',
    city: 'تونس',
    memorizedHizbCount: 8,
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
    createdAt: new Date('2026-08-20T10:00:00Z'),
    deletedAt: null,
    assistantId: 'ast-4444-4444-4444-4444',
    memorizedAhzab: [1, 2, 3, 4, 5, 6, 7, 8],
  };

  beforeEach(() => {
    mockJoinRequestRepo = {
      create: jest.fn(),
      existsPendingForUser: jest.fn(),
      findLatestForUser: jest.fn(),
      findByIdForDetail: jest.fn(),
      findPendingQueue: jest.fn(),
      acceptConditionally: jest.fn(),
      rejectConditionally: jest.fn(),
    };

    mockMembershipRepo = {
      create: jest.fn(),
    };

    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findAllByRole: jest.fn(),
      save: jest.fn(),
      promoteToStudent: jest.fn(),
    };

    mockCoverageRepo = {
      seedFromHizbSelection: jest.fn(),
    };

    mockManager = {} as unknown as jest.Mocked<EntityManager>;

    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (m: EntityManager) => Promise<unknown>) =>
          cb(mockManager),
        ),
    } as unknown as jest.Mocked<DataSource>;

    mockEventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    useCase = new AcceptJoinRequestUseCase(
      mockJoinRequestRepo,
      mockMembershipRepo,
      mockUserRepo,
      mockCoverageRepo,
      mockDataSource,
      mockEventEmitter,
    );
  });

  describe('Authorization & Scope checks (NFR-20 / APIQ-04)', () => {
    it('throws ForbiddenException when join request does not exist', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(null);

      await expect(
        useCase.execute(
          'ast-4444-4444-4444-4444',
          UserRole.Assistant,
          'non-existent-id',
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when join request is soft-deleted', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue({
        ...mockDetailRow,
        deletedAt: new Date(),
      });

      await expect(
        useCase.execute(
          'ast-4444-4444-4444-4444',
          UserRole.Assistant,
          mockDetailRow.id,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when Assistant is not assigned to the group', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);

      await expect(
        useCase.execute(
          'different-assistant-id',
          UserRole.Assistant,
          mockDetailRow.id,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('allows Admin to accept a join request for any group', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.acceptConditionally.mockResolvedValue({
        userId: mockDetailRow.userId,
        groupId: mockDetailRow.groupId,
        fullName: mockDetailRow.fullName,
        gender: mockDetailRow.gender as 'Male' | 'Female',
        memorizedAhzab: mockDetailRow.memorizedAhzab,
      });
      mockMembershipRepo.create.mockResolvedValue({
        id: 'mem-9999-9999',
        startedAt: '2026-08-23',
      });
      mockUserRepo.promoteToStudent.mockResolvedValue(undefined);
      mockCoverageRepo.seedFromHizbSelection.mockResolvedValue(undefined);

      const result = await useCase.execute(
        'admin-id',
        UserRole.Admin,
        mockDetailRow.id,
      );

      expect(result).toEqual({
        data: {
          membership_id: 'mem-9999-9999',
        },
      });
    });
  });

  describe('Atomic Transaction & Conflict Scenarios (DS-01)', () => {
    it('successfully accepts join request and performs atomic operations', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.acceptConditionally.mockResolvedValue({
        userId: mockDetailRow.userId,
        groupId: mockDetailRow.groupId,
        fullName: mockDetailRow.fullName,
        gender: mockDetailRow.gender as 'Male' | 'Female',
        memorizedAhzab: mockDetailRow.memorizedAhzab,
      });
      mockMembershipRepo.create.mockResolvedValue({
        id: 'mem-1111-1111-1111-1111',
        startedAt: '2026-08-23',
      });
      mockUserRepo.promoteToStudent.mockResolvedValue(undefined);
      mockCoverageRepo.seedFromHizbSelection.mockResolvedValue(undefined);

      const result = await useCase.execute(
        mockDetailRow.assistantId,
        UserRole.Assistant,
        mockDetailRow.id,
      );

      expect(result).toEqual({
        data: {
          membership_id: 'mem-1111-1111-1111-1111',
        },
      });

      // Verify repository calls with manager
      expect(mockJoinRequestRepo.acceptConditionally).toHaveBeenCalledWith(
        mockDetailRow.id,
        mockDetailRow.assistantId,
        mockManager,
      );
      expect(mockMembershipRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockDetailRow.userId,
          groupId: mockDetailRow.groupId,
          joinRequestId: mockDetailRow.id,
        }),
        mockManager,
      );

      expect(mockUserRepo.promoteToStudent).toHaveBeenCalledWith(
        mockDetailRow.userId,
        mockDetailRow.fullName,
        mockDetailRow.gender,
        mockManager,
      );
      expect(mockCoverageRepo.seedFromHizbSelection).toHaveBeenCalledWith(
        'mem-1111-1111-1111-1111',
        mockDetailRow.memorizedAhzab,
        mockManager,
      );

      // Verify domain event emission
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        JoinRequestAcceptedEvent.EVENT_NAME,
        expect.objectContaining({
          joinRequestId: mockDetailRow.id,
          membershipId: 'mem-1111-1111-1111-1111',
          applicantUserId: mockDetailRow.userId,
        }),
      );
    });

    it('throws 409 ALREADY_DECIDED when conditional update affects 0 rows', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.acceptConditionally.mockResolvedValue(null);

      try {
        await useCase.execute(
          mockDetailRow.assistantId,
          UserRole.Assistant,
          mockDetailRow.id,
        );
        fail('Expected ConflictException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as {
          statusCode: number;
          error: string;
          message: string;
        };
        expect(response.statusCode).toBe(409);
        expect(response.error).toBe('ALREADY_DECIDED');
      }

      expect(mockMembershipRepo.create).not.toHaveBeenCalled();
      expect(mockUserRepo.promoteToStudent).not.toHaveBeenCalled();
      expect(mockCoverageRepo.seedFromHizbSelection).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws 409 APPLICANT_NO_LONGER_ELIGIBLE when user already has active membership (DB-UQ-02)', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.acceptConditionally.mockResolvedValue({
        userId: mockDetailRow.userId,
        groupId: mockDetailRow.groupId,
        fullName: mockDetailRow.fullName,
        gender: mockDetailRow.gender as 'Male' | 'Female',
        memorizedAhzab: mockDetailRow.memorizedAhzab,
      });

      const uniqueConstraintError = {
        code: '23505',
        detail: 'Key (user_id)=(...) already exists in DB-UQ-02',
      };
      mockMembershipRepo.create.mockRejectedValue(uniqueConstraintError);

      try {
        await useCase.execute(
          mockDetailRow.assistantId,
          UserRole.Assistant,
          mockDetailRow.id,
        );
        fail('Expected ConflictException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as {
          statusCode: number;
          error: string;
          message: string;
        };
        expect(response.statusCode).toBe(409);
        expect(response.error).toBe('APPLICANT_NO_LONGER_ELIGIBLE');
      }

      expect(mockUserRepo.promoteToStudent).not.toHaveBeenCalled();
      expect(mockCoverageRepo.seedFromHizbSelection).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not throw when event emission fails', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.acceptConditionally.mockResolvedValue({
        userId: mockDetailRow.userId,
        groupId: mockDetailRow.groupId,
        fullName: mockDetailRow.fullName,
        gender: mockDetailRow.gender as 'Male' | 'Female',
        memorizedAhzab: mockDetailRow.memorizedAhzab,
      });
      mockMembershipRepo.create.mockResolvedValue({
        id: 'mem-1111-1111-1111-1111',
        startedAt: '2026-08-23',
      });
      mockUserRepo.promoteToStudent.mockResolvedValue(undefined);
      mockCoverageRepo.seedFromHizbSelection.mockResolvedValue(undefined);
      mockEventEmitter.emit.mockImplementation(() => {
        throw new Error('Event bus down');
      });

      const result = await useCase.execute(
        mockDetailRow.assistantId,
        UserRole.Assistant,
        mockDetailRow.id,
      );

      expect(result).toEqual({
        data: {
          membership_id: 'mem-1111-1111-1111-1111',
        },
      });
    });
  });
});
