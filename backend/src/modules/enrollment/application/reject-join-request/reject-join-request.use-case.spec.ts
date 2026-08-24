/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  IJoinRequestRepository,
  JoinRequestDetailRow,
} from '../../domain/join-request.repository.interface';
import { JoinRequestRejectedEvent } from '../../domain/events/join-request-rejected.event';
import { RejectJoinRequestUseCase } from './reject-join-request.use-case';

describe('RejectJoinRequestUseCase (Unit)', () => {
  let useCase: RejectJoinRequestUseCase;
  let mockJoinRequestRepo: jest.Mocked<IJoinRequestRepository>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;

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

    mockEventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    useCase = new RejectJoinRequestUseCase(
      mockJoinRequestRepo,
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

      expect(mockJoinRequestRepo.rejectConditionally).not.toHaveBeenCalled();
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

      expect(mockJoinRequestRepo.rejectConditionally).not.toHaveBeenCalled();
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

      expect(mockJoinRequestRepo.rejectConditionally).not.toHaveBeenCalled();
    });

    it('allows Admin to reject a join request for any group', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.rejectConditionally.mockResolvedValue({
        userId: mockDetailRow.userId,
      });

      const result = await useCase.execute(
        'admin-id',
        UserRole.Admin,
        mockDetailRow.id,
      );

      expect(result).toEqual({
        data: {
          status: 'Rejected',
        },
      });

      expect(mockJoinRequestRepo.rejectConditionally).toHaveBeenCalledWith(
        mockDetailRow.id,
        'admin-id',
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        JoinRequestRejectedEvent.EVENT_NAME,
        expect.objectContaining({
          joinRequestId: mockDetailRow.id,
          applicantUserId: mockDetailRow.userId,
        }),
      );
    });
  });

  describe('Conditional Update & Conflict Scenarios (FR-REQ-06)', () => {
    it('successfully rejects join request and emits domain event', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.rejectConditionally.mockResolvedValue({
        userId: mockDetailRow.userId,
      });

      const result = await useCase.execute(
        mockDetailRow.assistantId,
        UserRole.Assistant,
        mockDetailRow.id,
      );

      expect(result).toEqual({
        data: {
          status: 'Rejected',
        },
      });

      expect(mockJoinRequestRepo.rejectConditionally).toHaveBeenCalledWith(
        mockDetailRow.id,
        mockDetailRow.assistantId,
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        JoinRequestRejectedEvent.EVENT_NAME,
        expect.objectContaining({
          joinRequestId: mockDetailRow.id,
          applicantUserId: mockDetailRow.userId,
        }),
      );
    });

    it('throws 409 ALREADY_DECIDED when conditional update affects 0 rows', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.rejectConditionally.mockResolvedValue(null);

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
        expect(response.message).toBe('تم اتخاذ قرار بشأن هذا الطلب مسبقاً');
      }

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not throw when event emission fails', async () => {
      mockJoinRequestRepo.findByIdForDetail.mockResolvedValue(mockDetailRow);
      mockJoinRequestRepo.rejectConditionally.mockResolvedValue({
        userId: mockDetailRow.userId,
      });
      mockEventEmitter.emit.mockImplementation(() => {
        throw new Error('Event bus error');
      });

      const result = await useCase.execute(
        mockDetailRow.assistantId,
        UserRole.Assistant,
        mockDetailRow.id,
      );

      expect(result).toEqual({
        data: {
          status: 'Rejected',
        },
      });
    });
  });
});
