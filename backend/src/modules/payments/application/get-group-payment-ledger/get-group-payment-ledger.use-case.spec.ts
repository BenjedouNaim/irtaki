/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { IGroupPaymentScope } from '../../domain/group-payment-scope.interface';
import {
  GroupLedgerContextRecord,
  IPaymentRepository,
} from '../../domain/payment.repository.interface';
import { GetGroupPaymentLedgerUseCase } from './get-group-payment-ledger.use-case';

describe('GetGroupPaymentLedgerUseCase (F-PAY-02 / API-046)', () => {
  let useCase: GetGroupPaymentLedgerUseCase;
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let groupPaymentScope: jest.Mocked<IGroupPaymentScope>;

  const groupId = 'group-1';
  /** Fixed instant so every derived figure below is deterministic. */
  const now = new Date('2026-06-01T10:00:00.000Z');

  function member(
    overrides: Partial<GroupLedgerContextRecord> = {},
  ): GroupLedgerContextRecord {
    return {
      membershipId: 'membership-1',
      fullName: 'أحمد الطرابلسي',
      startedAt: '2026-03-02',
      endedAt: null,
      archivedAt: null,
      timezone: 'Africa/Tunis',
      ...overrides,
    };
  }

  beforeEach(() => {
    paymentRepository = {
      findOwnLedgerContextByUserId: jest.fn(),
      findPaidCyclesByMembershipId: jest.fn(),
      findGroupLedgerContextsByGroupId: jest.fn().mockResolvedValue([]),
      findPaidCyclesByMembershipIds: jest.fn().mockResolvedValue([]),
      findLedgerContextByMembershipId: jest.fn(),
      createPaidCycle: jest.fn(),
    };
    groupPaymentScope = {
      isGroupOfAssistant: jest.fn(),
      groupExists: jest.fn().mockResolvedValue(true),
    };
    useCase = new GetGroupPaymentLedgerUseCase(
      paymentRepository,
      groupPaymentScope,
    );
  });

  it('queries only by the guard-verified group id and derives one ledger per member (TS §15.2 step 4)', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      member(),
    ]);

    const result = await useCase.execute(groupId, {}, now);

    expect(
      paymentRepository.findGroupLedgerContextsByGroupId,
    ).toHaveBeenCalledWith(groupId);
    expect(result.data).toEqual([
      {
        membership_id: 'membership-1',
        full_name: 'أحمد الطرابلسي',
        cycles: [
          {
            index: 0,
            start_date: '2026-03-02',
            end_date: '2026-06-01',
            // BR-33/BR-55: the current cycle inside its last 10 days.
            status: 'Due Soon',
          },
        ],
        next_due_date: '2026-06-01',
        arrears_count: 0,
      },
    ]);
  });

  it('carries no `pagination` key — API-046 is absent from APIS §9.2 (bounded by one roster)', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      member(),
    ]);

    const result = await useCase.execute(groupId, {}, now);

    expect(Object.keys(result)).toEqual(['data']);
  });

  it('reads every member payment in ONE query, never one per student', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      member({ membershipId: 'm-1' }),
      member({ membershipId: 'm-2', fullName: 'مريم الجبالي' }),
    ]);
    paymentRepository.findPaidCyclesByMembershipIds.mockResolvedValue([
      {
        membershipId: 'm-2',
        cycleIndex: 0,
        paidAt: '2026-03-05T09:00:00.000Z',
      },
    ]);

    const result = await useCase.execute(groupId, {}, now);

    expect(
      paymentRepository.findPaidCyclesByMembershipIds,
    ).toHaveBeenCalledTimes(1);
    expect(
      paymentRepository.findPaidCyclesByMembershipIds,
    ).toHaveBeenCalledWith(['m-1', 'm-2']);
    expect(
      paymentRepository.findPaidCyclesByMembershipId,
    ).not.toHaveBeenCalled();
    // Only m-2's cycle is Paid — the rows are attributed per membership.
    expect(result.data.map((entry) => entry.cycles[0].status)).toEqual([
      'Due Soon',
      'Paid',
    ]);
    expect(result.data[1].cycles[0].paid_at).toBe('2026-03-05T09:00:00.000Z');
    expect(result.data[0].cycles[0]).not.toHaveProperty('paid_at');
  });

  it('passes `full_name` through as null rather than defaulting it (DEC-B04 posture)', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      member({ fullName: null }),
    ]);

    const result = await useCase.execute(groupId, {}, now);

    expect(result.data[0].full_name).toBeNull();
  });

  it('derives each student against their OWN users.timezone (T-01, INV-27)', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      // 2026-06-01T10:00Z is already 2026-06-02 at UTC+14 …
      member({ membershipId: 'm-ahead', timezone: 'Pacific/Kiritimati' }),
      // … and still 2026-05-31 at UTC-11.
      member({ membershipId: 'm-behind', timezone: 'Pacific/Pago_Pago' }),
    ]);

    const result = await useCase.execute(groupId, {}, now);

    // Ahead of the cycle boundary: cycle 1 has opened, cycle 0 is arrears.
    expect(result.data[0].cycles).toHaveLength(2);
    expect(result.data[0].arrears_count).toBe(1);
    // Behind it: still one cycle, one day short of the Due Soon window's end.
    expect(result.data[1].cycles).toHaveLength(1);
    expect(result.data[1].arrears_count).toBe(0);
  });

  it.each([
    ['Paid' as const, ['m-paid']],
    ['Due Soon' as const, ['m-due-soon']],
    ['Unpaid' as const, ['m-unpaid']],
  ])(
    'filters students by their current-cycle status when ?status=%s (FR-PAY-06, UF §18)',
    async (status, expected) => {
      paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
        member({ membershipId: 'm-paid' }),
        member({ membershipId: 'm-due-soon' }),
        // Started recently, so the current cycle 0 runs to 2026-08-14 —
        // nowhere near the 10-day Due Soon window, and plainly Unpaid.
        member({ membershipId: 'm-unpaid', startedAt: '2026-05-15' }),
      ]);
      paymentRepository.findPaidCyclesByMembershipIds.mockResolvedValue([
        {
          membershipId: 'm-paid',
          cycleIndex: 0,
          paidAt: '2026-03-05T09:00:00.000Z',
        },
      ]);

      const result = await useCase.execute(groupId, { status }, now);

      expect(result.data.map((entry) => entry.membership_id)).toEqual(expected);
    },
  );

  it('returns every student, unfiltered, when no status is given (the "All" chip)', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      member({ membershipId: 'm-1' }),
      member({ membershipId: 'm-2', startedAt: '2026-05-15' }),
    ]);

    const result = await useCase.execute(groupId, {}, now);

    expect(result.data.map((entry) => entry.membership_id)).toEqual([
      'm-1',
      'm-2',
    ]);
  });

  it('returns a matched student’s ledger whole — the filter selects students, not cycles', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      // Cycle 0 (14 Feb – 13 May) is past and unpaid; cycle 1 (14 May –
      // 13 Aug) is current and far from its end, so the student's badge
      // reads Unpaid while an arrears count of 1 rides alongside it.
      member({ membershipId: 'm-1', startedAt: '2026-02-14' }),
    ]);

    const result = await useCase.execute(groupId, { status: 'Unpaid' }, now);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].cycles.map((cycle) => cycle.index)).toEqual([0, 1]);
    expect(result.data[0].arrears_count).toBe(1);
  });

  it('returns an empty collection for a group with no Active members (UF §18 "No students in this group")', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([]);

    const result = await useCase.execute(groupId, {}, now);

    expect(result.data).toEqual([]);
    expect(groupPaymentScope.groupExists).toHaveBeenCalledWith(groupId);
  });

  it('throws 404 NOT_FOUND when the group genuinely does not exist (the Admin path, APIS §9.6)', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([]);
    groupPaymentScope.groupExists.mockResolvedValue(false);

    await expect(useCase.execute(groupId, {}, now)).rejects.toThrow(
      NotFoundException,
    );
    await expect(useCase.execute(groupId, {}, now)).rejects.toMatchObject({
      response: { statusCode: 404, error: 'NOT_FOUND' },
    });
  });

  it('never spends the existence lookup when the group has members', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      member(),
    ]);

    await useCase.execute(groupId, {}, now);

    expect(groupPaymentScope.groupExists).not.toHaveBeenCalled();
  });

  it('stops cycle generation at group archival, keeping the arrears visible (FR-PAY-12, EC-57)', async () => {
    paymentRepository.findGroupLedgerContextsByGroupId.mockResolvedValue([
      member({
        startedAt: '2025-11-30',
        archivedAt: '2026-03-01T12:00:00.000Z',
      }),
    ]);

    const result = await useCase.execute(groupId, {}, now);

    expect(result.data[0].cycles).toEqual([
      // ISS-14: 30 Nov + 3 months clamps to 28 Feb 2026, so cycle 0 ends the
      // day before — never 1 or 2 March.
      {
        index: 0,
        start_date: '2025-11-30',
        end_date: '2026-02-27',
        status: 'Unpaid',
      },
      {
        index: 1,
        start_date: '2026-02-28',
        end_date: '2026-05-29',
        status: 'Unpaid',
      },
    ]);
    expect(result.data[0].arrears_count).toBe(2);
  });
});
