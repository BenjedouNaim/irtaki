/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import {
  IPaymentRepository,
  OwnLedgerContextRecord,
} from '../../domain/payment.repository.interface';
import { GetOwnPaymentLedgerUseCase } from './get-own-payment-ledger.use-case';

describe('GetOwnPaymentLedgerUseCase (F-PAY-01 / API-045)', () => {
  let useCase: GetOwnPaymentLedgerUseCase;
  let paymentRepository: jest.Mocked<IPaymentRepository>;

  const userId = 'student-1';

  const context: OwnLedgerContextRecord = {
    membershipId: 'membership-1',
    startedAt: '2026-01-15',
    endedAt: null,
    archivedAt: null,
    timezone: 'Africa/Tunis',
  };

  beforeEach(() => {
    paymentRepository = {
      findOwnLedgerContextByUserId: jest.fn(),
      findPaidCyclesByMembershipId: jest.fn().mockResolvedValue([]),
      findGroupLedgerContextsByGroupId: jest.fn().mockResolvedValue([]),
      findPaidCyclesByMembershipIds: jest.fn().mockResolvedValue([]),
      findLedgerContextByMembershipId: jest.fn(),
      createPaidCycle: jest.fn(),
    };
    useCase = new GetOwnPaymentLedgerUseCase(paymentRepository);
  });

  it('returns the API-045 envelope with a fully derived ledger', async () => {
    paymentRepository.findOwnLedgerContextByUserId.mockResolvedValue(context);
    paymentRepository.findPaidCyclesByMembershipId.mockResolvedValue([
      { cycleIndex: 0, paidAt: '2026-02-03T09:30:00.000Z' },
    ]);

    const result = await useCase.execute(
      userId,
      new Date('2026-05-01T10:00:00.000Z'),
    );

    expect(paymentRepository.findOwnLedgerContextByUserId).toHaveBeenCalledWith(
      userId,
    );
    expect(paymentRepository.findPaidCyclesByMembershipId).toHaveBeenCalledWith(
      'membership-1',
    );
    expect(result).toEqual({
      data: {
        cycles: [
          {
            index: 0,
            start_date: '2026-01-15',
            end_date: '2026-04-14',
            status: 'Paid',
            paid_at: '2026-02-03T09:30:00.000Z',
          },
          {
            index: 1,
            start_date: '2026-04-15',
            end_date: '2026-07-14',
            status: 'Unpaid',
          },
        ],
        next_due_date: '2026-07-14',
        arrears_count: 0,
      },
    });
  });

  it('omits paid_at entirely on a cycle that is not Paid (APIS §10.11)', async () => {
    paymentRepository.findOwnLedgerContextByUserId.mockResolvedValue(context);

    const result = await useCase.execute(
      userId,
      new Date('2026-02-01T10:00:00.000Z'),
    );

    expect(result.data.cycles[0]).not.toHaveProperty('paid_at');
  });

  it('resolves "today" through the student own timezone (T-01, INV-27)', async () => {
    // 2026-04-04T23:30Z is already 2026-04-05 in Africa/Tunis (UTC+1), and
    // 2026-04-04 in UTC — but only the student's own zone decides.
    paymentRepository.findOwnLedgerContextByUserId.mockResolvedValue({
      ...context,
      // cycle 0 = 2026-01-15 … 2026-04-14; Due Soon opens on 2026-04-04.
      timezone: 'Pacific/Honolulu',
    });

    const result = await useCase.execute(
      userId,
      new Date('2026-04-04T05:00:00.000Z'),
    );

    // 2026-04-03 in Honolulu (UTC−10) — one day before the window opens.
    expect(result.data.cycles[0].status).toBe('Unpaid');
  });

  it('stops cycle generation at the group archival date (FR-PAY-12)', async () => {
    paymentRepository.findOwnLedgerContextByUserId.mockResolvedValue({
      ...context,
      archivedAt: '2026-05-02T08:00:00.000Z',
    });

    const result = await useCase.execute(
      userId,
      new Date('2026-12-01T10:00:00.000Z'),
    );

    expect(result.data.cycles).toHaveLength(2);
    expect(result.data.arrears_count).toBe(2);
  });

  it('throws 404 NOT_FOUND when the caller has no Active membership', async () => {
    paymentRepository.findOwnLedgerContextByUserId.mockResolvedValue(null);

    await expect(useCase.execute(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      paymentRepository.findPaidCyclesByMembershipId,
    ).not.toHaveBeenCalled();
  });
});
