/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PAYMENT_CYCLE_AMOUNT } from '../../domain/payment-cycle';
import {
  IPaymentRepository,
  OwnLedgerContextRecord,
  PaymentRecordCreatedRecord,
} from '../../domain/payment.repository.interface';
import { RecordPaymentCycleUseCase } from './record-payment-cycle.use-case';

describe('RecordPaymentCycleUseCase (F-PAY-03 / API-047)', () => {
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let useCase: RecordPaymentCycleUseCase;

  const membershipId = 'membership-1';
  const assistantId = 'assistant-1';
  /** Fixed clock so the derived cycle count is exact, not date-dependent. */
  const now = new Date('2026-09-03T10:00:00.000Z');

  function context(
    overrides: Partial<OwnLedgerContextRecord> = {},
  ): OwnLedgerContextRecord {
    return {
      membershipId,
      // 2026-09-03 sits in cycle 2: [03-02, 06-01], [06-02, 09-01],
      // [09-02, 12-01].
      startedAt: '2026-03-02',
      endedAt: null,
      archivedAt: null,
      timezone: 'Africa/Tunis',
      ...overrides,
    };
  }

  function created(
    overrides: Partial<PaymentRecordCreatedRecord> = {},
  ): PaymentRecordCreatedRecord {
    return {
      id: 'payment-1',
      cycleIndex: 1,
      amount: 30,
      paidAt: now.toISOString(),
      recordedBy: assistantId,
      ...overrides,
    };
  }

  function uniqueViolation(): Error {
    return Object.assign(new Error('duplicate key value'), { code: '23505' });
  }

  beforeEach(() => {
    paymentRepository = {
      findOwnLedgerContextByUserId: jest.fn(),
      findPaidCyclesByMembershipId: jest.fn(),
      findGroupLedgerContextsByGroupId: jest.fn(),
      findPaidCyclesByMembershipIds: jest.fn(),
      findLedgerContextByMembershipId: jest.fn().mockResolvedValue(context()),
      createPaidCycle: jest.fn().mockResolvedValue(created()),
    };
    useCase = new RecordPaymentCycleUseCase(paymentRepository);
  });

  function record(cycleIndex: number) {
    return useCase.execute(
      { membershipId, recordedBy: assistantId, cycleIndex },
      now,
    );
  }

  describe('the happy path (UC-09 steps 6–7, APIS §10.11)', () => {
    it('returns the five fields APIS §10.11 lists, in the { data } envelope', async () => {
      const response = await record(1);

      expect(response).toEqual({
        data: {
          id: 'payment-1',
          cycle_index: 1,
          amount: 30,
          paid_at: now.toISOString(),
          recorded_by: assistantId,
        },
      });
    });

    it('stores BR-31’s fixed 30 TND, taken from the domain and never from the caller', async () => {
      await record(1);

      expect(paymentRepository.createPaidCycle).toHaveBeenCalledWith({
        membershipId,
        cycleIndex: 1,
        amount: PAYMENT_CYCLE_AMOUNT,
        recordedBy: assistantId,
        paidAt: now,
      });
      expect(PAYMENT_CYCLE_AMOUNT).toBe(30);
    });

    it('records recorded_by as the calling Assistant (BR-34)', async () => {
      await record(0);

      expect(paymentRepository.createPaidCycle).toHaveBeenCalledWith(
        expect.objectContaining({ recordedBy: assistantId }),
      );
    });

    it.each([0, 1, 2])(
      'accepts cycle %i in any order — BR-56/FR-PAY-11 require no earlier cycle to be paid first',
      async (cycleIndex) => {
        await expect(record(cycleIndex)).resolves.toBeDefined();
      },
    );

    it('never reads the existing paid rows before inserting (TS §20: no SELECT-then-INSERT)', async () => {
      await record(1);

      expect(
        paymentRepository.findPaidCyclesByMembershipId,
      ).not.toHaveBeenCalled();
      expect(
        paymentRepository.findPaidCyclesByMembershipIds,
      ).not.toHaveBeenCalled();
    });

    it('scopes its own lookup on the membership id (SA §14 second layer)', async () => {
      await record(1);

      expect(
        paymentRepository.findLedgerContextByMembershipId,
      ).toHaveBeenCalledWith(membershipId);
    });
  });

  describe('VR-37 — a future cycle cannot be prepaid (422 FUTURE_CYCLE)', () => {
    it('rejects the cycle after the current one', async () => {
      await expect(record(3)).rejects.toThrow(UnprocessableEntityException);
      expect(paymentRepository.createPaidCycle).not.toHaveBeenCalled();
    });

    it('carries the FUTURE_CYCLE code and a VR-37 detail (APIS §9.5)', async () => {
      const error: unknown = await record(3).catch((e: unknown) => e);

      expect(
        (error as UnprocessableEntityException).getResponse(),
      ).toMatchObject({
        statusCode: 422,
        error: 'FUTURE_CYCLE',
        details: [{ field: 'cycle_index', rule: 'VR-37' }],
      });
    });

    it('accepts the current cycle itself — the bound is inclusive', async () => {
      await expect(record(2)).resolves.toBeDefined();
    });

    it('treats a cycle past the FR-PAY-12 archival stop as a future cycle', async () => {
      paymentRepository.findLedgerContextByMembershipId.mockResolvedValue(
        context({ archivedAt: '2026-06-15T12:00:00.000Z' }),
      );

      // Generation stops at 15 June 2026, so cycle 1 is the last one.
      await expect(record(1)).resolves.toBeDefined();
      await expect(record(2)).rejects.toThrow(UnprocessableEntityException);
    });

    it('treats a cycle past the FR-PAY-12 termination stop as a future cycle', async () => {
      paymentRepository.findLedgerContextByMembershipId.mockResolvedValue(
        context({ endedAt: '2026-06-15' }),
      );

      await expect(record(1)).resolves.toBeDefined();
      await expect(record(2)).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects every index when no cycle has started yet', async () => {
      paymentRepository.findLedgerContextByMembershipId.mockResolvedValue(
        context({ startedAt: '2027-01-01' }),
      );

      await expect(record(0)).rejects.toThrow(UnprocessableEntityException);
    });

    it('reads "today" in the student’s own timezone (T-01, INV-27)', async () => {
      // 2026-09-01T23:30Z is already 2 September in Africa/Tunis (UTC+1),
      // the first day of cycle 2 — so cycle 2 is payable there and not in
      // a timezone still on 1 September.
      const boundary = new Date('2026-09-01T23:30:00.000Z');

      await expect(
        useCase.execute(
          { membershipId, recordedBy: assistantId, cycleIndex: 2 },
          boundary,
        ),
      ).resolves.toBeDefined();

      paymentRepository.findLedgerContextByMembershipId.mockResolvedValue(
        context({ timezone: 'UTC' }),
      );
      await expect(
        useCase.execute(
          { membershipId, recordedBy: assistantId, cycleIndex: 2 },
          boundary,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('VR-26 — a cycle may be marked paid only once (409 CYCLE_ALREADY_PAID)', () => {
    it('translates the DB-UQ-06 unique violation into a clean 409', async () => {
      paymentRepository.createPaidCycle.mockRejectedValue(uniqueViolation());

      const error: unknown = await record(1).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        statusCode: 409,
        error: 'CYCLE_ALREADY_PAID',
      });
    });

    it('never leaks the Postgres error text (SA §24)', async () => {
      paymentRepository.createPaidCycle.mockRejectedValue(uniqueViolation());

      const error: unknown = await record(1).catch((e: unknown) => e);
      const response = (error as ConflictException).getResponse() as {
        message: string;
      };
      expect(response.message).not.toMatch(/duplicate key/);
      expect(response.message).toMatch(/[؀-ۿ]/);
    });

    it('recognises the violation when the driver nests the code', async () => {
      paymentRepository.createPaidCycle.mockRejectedValue({
        driverError: { code: '23505' },
      });

      await expect(record(1)).rejects.toThrow(ConflictException);
    });

    it('rethrows any other repository failure untouched', async () => {
      const boom = new Error('connection reset');
      paymentRepository.createPaidCycle.mockRejectedValue(boom);

      await expect(record(1)).rejects.toThrow(boom);
    });
  });

  describe('scope (SA §14 second layer)', () => {
    it('answers the uniform 403 SCOPE_DENIED when the membership resolves to nothing Active', async () => {
      paymentRepository.findLedgerContextByMembershipId.mockResolvedValue(null);

      const error: unknown = await record(0).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        error: 'SCOPE_DENIED',
      });
      expect(paymentRepository.createPaidCycle).not.toHaveBeenCalled();
    });
  });

  it('exposes no reversal, correction or delete path (ISS-02/APIQ-02)', () => {
    const methods = Object.getOwnPropertyNames(
      RecordPaymentCycleUseCase.prototype,
    );
    expect(methods).toEqual(['constructor', 'execute']);
    expect(Object.keys(paymentRepository)).not.toContain('deletePaidCycle');
  });
});
