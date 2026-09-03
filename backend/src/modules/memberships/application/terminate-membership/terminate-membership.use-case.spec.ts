/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { IUserRepository } from '../../../identity/domain/user.repository.interface';
import { IMembershipRepository } from '../../domain/membership.repository.interface';
import { MembershipTerminatedEvent } from '../../domain/events/membership-terminated.event';
import { TerminateMembershipUseCase } from './terminate-membership.use-case';

describe('TerminateMembershipUseCase (Unit)', () => {
  let useCase: TerminateMembershipUseCase;
  let mockMembershipRepo: jest.Mocked<IMembershipRepository>;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;
  let mockManager: jest.Mocked<EntityManager>;

  const callerId = 'admin-1111-1111-1111-1111';
  const membershipId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const endedUserId = 'user-3333-3333-3333-3333';
  const joinRequestId = 'jr-4444-4444-4444-4444';

  beforeEach(() => {
    mockMembershipRepo = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findRosterByGroupId: jest.fn(),
      findByIdForRecovery: jest.fn(),
      findStateAndUserById: jest.fn(),
      terminateConditionally: jest.fn(),
      softDeleteMembershipRecords: jest.fn(),
    };

    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findAllByRole: jest.fn(),
      save: jest.fn(),
      promoteToStudent: jest.fn(),
      demoteToUser: jest.fn(),
      promoteFromUserRole: jest.fn(),
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

    useCase = new TerminateMembershipUseCase(
      mockMembershipRepo,
      mockUserRepo,
      mockDataSource,
      mockEventEmitter,
    );
  });

  function seedHappyPathMocks(): void {
    mockMembershipRepo.findStateAndUserById.mockResolvedValue({
      userId: endedUserId,
      state: 'Active',
    });
    mockMembershipRepo.terminateConditionally.mockResolvedValue({
      userId: endedUserId,
      joinRequestId,
    });
    mockMembershipRepo.softDeleteMembershipRecords.mockResolvedValue(undefined);
    mockUserRepo.demoteToUser.mockResolvedValue(undefined);
  }

  describe('Happy path (UC-12 / API-027)', () => {
    it('terminates atomically inside one transaction, cascades soft-delete, demotes to User and emits MembershipTerminatedEvent exactly once', async () => {
      seedHappyPathMocks();

      const result = await useCase.execute(callerId, membershipId);

      expect(result).toEqual({
        data: { membership_id: membershipId, state: 'Terminated' },
      });

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockMembershipRepo.findStateAndUserById).toHaveBeenCalledWith(
        membershipId,
        mockManager,
      );

      const today = new Date().toISOString().split('T')[0];
      expect(mockMembershipRepo.terminateConditionally).toHaveBeenCalledWith(
        membershipId,
        callerId,
        today,
        mockManager,
      );
      expect(
        mockMembershipRepo.softDeleteMembershipRecords,
      ).toHaveBeenCalledWith(membershipId, joinRequestId, mockManager);
      expect(mockUserRepo.demoteToUser).toHaveBeenCalledWith(
        endedUserId,
        mockManager,
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        MembershipTerminatedEvent.EVENT_NAME,
        expect.objectContaining({
          membershipId,
          endedBy: callerId,
          endedAt: today,
        }),
      );
    });

    it('emits MembershipTerminatedEvent only AFTER the transaction resolves', async () => {
      seedHappyPathMocks();

      let resolveTx!: () => void;
      const txGate = new Promise<void>((resolve) => {
        resolveTx = resolve;
      });
      (mockDataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<unknown>) => {
          await txGate;
          return cb(mockManager);
        },
      );

      const promise = useCase.execute(callerId, membershipId);

      // Let the use case reach its await on the transaction gate
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();

      resolveTx();
      await promise;

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(
        mockDataSource.transaction.mock.invocationCallOrder[0],
      ).toBeLessThan(mockEventEmitter.emit.mock.invocationCallOrder[0]);
    });
  });

  describe('Guard clauses', () => {
    it('throws 404 NOT_FOUND for a non-UUID id before any repository or transaction call', async () => {
      try {
        await useCase.execute(callerId, 'not-a-uuid');
        fail('Expected NotFoundException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(NotFoundException);
        const response = (err as NotFoundException).getResponse() as {
          statusCode: number;
          error: string;
          message: string;
        };
        expect(response.statusCode).toBe(404);
        expect(response.error).toBe('NOT_FOUND');
      }

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockMembershipRepo.findStateAndUserById).not.toHaveBeenCalled();
      expect(mockMembershipRepo.terminateConditionally).not.toHaveBeenCalled();
      expect(
        mockMembershipRepo.softDeleteMembershipRecords,
      ).not.toHaveBeenCalled();
      expect(mockUserRepo.demoteToUser).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws 404 NOT_FOUND when the membership does not exist', async () => {
      mockMembershipRepo.findStateAndUserById.mockResolvedValue(null);

      try {
        await useCase.execute(callerId, membershipId);
        fail('Expected NotFoundException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(NotFoundException);
        const response = (err as NotFoundException).getResponse() as {
          statusCode: number;
          error: string;
          message: string;
        };
        expect(response.statusCode).toBe(404);
        expect(response.error).toBe('NOT_FOUND');
      }

      expect(mockMembershipRepo.terminateConditionally).not.toHaveBeenCalled();
      expect(
        mockMembershipRepo.softDeleteMembershipRecords,
      ).not.toHaveBeenCalled();
      expect(mockUserRepo.demoteToUser).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws 403 CANNOT_REMOVE_SELF when the caller terminates their own membership', async () => {
      mockMembershipRepo.findStateAndUserById.mockResolvedValue({
        userId: callerId,
        state: 'Active',
      });

      try {
        await useCase.execute(callerId, membershipId);
        fail('Expected ForbiddenException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const response = (err as ForbiddenException).getResponse() as {
          statusCode: number;
          error: string;
          message: string;
        };
        expect(response.statusCode).toBe(403);
        expect(response.error).toBe('CANNOT_REMOVE_SELF');
      }

      expect(mockMembershipRepo.terminateConditionally).not.toHaveBeenCalled();
      expect(
        mockMembershipRepo.softDeleteMembershipRecords,
      ).not.toHaveBeenCalled();
      expect(mockUserRepo.demoteToUser).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws 409 ALREADY_TERMINATED when membership state is not Active', async () => {
      mockMembershipRepo.findStateAndUserById.mockResolvedValue({
        userId: endedUserId,
        state: 'Terminated',
      });

      try {
        await useCase.execute(callerId, membershipId);
        fail('Expected ConflictException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as {
          statusCode: number;
          error: string;
          message: string;
        };
        expect(response.statusCode).toBe(409);
        expect(response.error).toBe('ALREADY_TERMINATED');
      }

      expect(mockMembershipRepo.terminateConditionally).not.toHaveBeenCalled();
      expect(
        mockMembershipRepo.softDeleteMembershipRecords,
      ).not.toHaveBeenCalled();
      expect(mockUserRepo.demoteToUser).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('Concurrency protection (0-row conditional update)', () => {
    it('throws 409 ALREADY_TERMINATED when terminateConditionally affects 0 rows, without cascading or demoting', async () => {
      mockMembershipRepo.findStateAndUserById.mockResolvedValue({
        userId: endedUserId,
        state: 'Active',
      });
      mockMembershipRepo.terminateConditionally.mockResolvedValue(null);

      try {
        await useCase.execute(callerId, membershipId);
        fail('Expected ConflictException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as {
          statusCode: number;
          error: string;
          message: string;
        };
        expect(response.statusCode).toBe(409);
        expect(response.error).toBe('ALREADY_TERMINATED');
      }

      expect(
        mockMembershipRepo.softDeleteMembershipRecords,
      ).not.toHaveBeenCalled();
      expect(mockUserRepo.demoteToUser).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('Notification degradation (ADR: events are best-effort)', () => {
    it('still resolves with the success envelope when event emission throws', async () => {
      seedHappyPathMocks();
      mockEventEmitter.emit.mockImplementation(() => {
        throw new Error('Event bus down');
      });

      const result = await useCase.execute(callerId, membershipId);

      expect(result).toEqual({
        data: { membership_id: membershipId, state: 'Terminated' },
      });
      expect(mockUserRepo.demoteToUser).toHaveBeenCalledTimes(1);
    });
  });
});
