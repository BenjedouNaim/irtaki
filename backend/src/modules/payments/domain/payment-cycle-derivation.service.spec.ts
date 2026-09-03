import {
  DeriveLedgerInput,
  PaymentCycleDerivationService,
} from './payment-cycle-derivation.service';

function input(overrides: Partial<DeriveLedgerInput> = {}): DeriveLedgerInput {
  return {
    startedAt: '2026-01-15',
    today: '2026-01-20',
    endedAt: null,
    archivedAt: null,
    paidCycles: [],
    ...overrides,
  };
}

describe('PaymentCycleDerivationService (DS-06)', () => {
  describe('cycle generation (FR-PAY-09, FR-PAY-12)', () => {
    it('derives cycle 0 from the very first day of the membership', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({ startedAt: '2026-01-15', today: '2026-01-15' }),
      );

      expect(ledger.cycles).toEqual([
        {
          index: 0,
          startDate: '2026-01-15',
          endDate: '2026-04-14',
          status: 'Unpaid',
          paidAt: null,
        },
      ]);
    });

    it('advances a cycle every three months irrespective of payment', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({ startedAt: '2026-01-15', today: '2026-08-01' }),
      );

      expect(ledger.cycles.map((c) => [c.startDate, c.endDate])).toEqual([
        ['2026-01-15', '2026-04-14'],
        ['2026-04-15', '2026-07-14'],
        ['2026-07-15', '2026-10-14'],
      ]);
    });

    it('stops generating at a group archival date (DEC-C03)', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-12-01',
          archivedAt: '2026-05-02',
        }),
      );

      expect(ledger.cycles).toHaveLength(2);
      expect(ledger.cycles[1].startDate).toBe('2026-04-15');
    });

    it('stops generating at a membership end date', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-12-01',
          endedAt: '2026-04-20',
        }),
      );

      expect(ledger.cycles).toHaveLength(2);
    });

    it('takes the earliest of today, ended_at and archived_at', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-12-01',
          endedAt: '2026-09-01',
          archivedAt: '2026-04-01',
        }),
      );

      expect(ledger.cycles).toHaveLength(1);
    });
  });

  describe('status (FR-PAY-03/04, BR-33, BR-55)', () => {
    it('marks a cycle Paid when a PaymentRecord exists and carries paid_at', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-05-01',
          paidCycles: [{ cycleIndex: 0, paidAt: '2026-02-03T09:00:00.000Z' }],
        }),
      );

      expect(ledger.cycles[0].status).toBe('Paid');
      expect(ledger.cycles[0].paidAt).toBe('2026-02-03T09:00:00.000Z');
      expect(ledger.cycles[1].status).toBe('Unpaid');
    });

    it('flips the current cycle to Due Soon exactly 10 days before its end (AC-19)', () => {
      // cycle 0 = 2026-01-15 … 2026-04-14, so the window opens 2026-04-04.
      const onTheDay = PaymentCycleDerivationService.derive(
        input({ today: '2026-04-04' }),
      );
      const dayBefore = PaymentCycleDerivationService.derive(
        input({ today: '2026-04-03' }),
      );

      expect(onTheDay.cycles[0].status).toBe('Due Soon');
      expect(dayBefore.cycles[0].status).toBe('Unpaid');
    });

    it('keeps Due Soon on the last day of the cycle', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({ today: '2026-04-14' }),
      );

      expect(ledger.cycles[0].status).toBe('Due Soon');
    });

    it('never marks an older unpaid cycle Due Soon (BR-55)', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({ startedAt: '2026-01-15', today: '2026-07-10' }),
      );

      expect(ledger.cycles.map((c) => c.status)).toEqual([
        'Unpaid',
        'Due Soon',
      ]);
    });

    it('prefers Paid over Due Soon on the current cycle', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          today: '2026-04-10',
          paidCycles: [{ cycleIndex: 0, paidAt: '2026-04-05T10:00:00.000Z' }],
        }),
      );

      expect(ledger.cycles[0].status).toBe('Paid');
    });

    it('leaves no cycle Due Soon once generation has stopped', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-12-01',
          archivedAt: '2026-05-02',
        }),
      );

      expect(ledger.cycles.every((c) => c.status === 'Unpaid')).toBe(true);
    });
  });

  describe('next_due_date and arrears_count (DEC-B06, FR-PAY-10)', () => {
    it('points next_due_date at the OLDEST unpaid cycle, not the current one', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-08-01',
          paidCycles: [{ cycleIndex: 1, paidAt: '2026-05-01T08:00:00.000Z' }],
        }),
      );

      expect(ledger.nextDueDate).toBe('2026-04-14');
    });

    it('counts every past unpaid cycle as arrears, excluding the current one', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({ startedAt: '2026-01-15', today: '2026-11-01' }),
      );

      // Cycles 0…2 are past and unpaid; cycle 3 contains today.
      expect(ledger.cycles).toHaveLength(4);
      expect(ledger.arrearsCount).toBe(3);
    });

    it('does not count a paid past cycle as arrears', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-11-01',
          paidCycles: [
            { cycleIndex: 0, paidAt: '2026-02-01T08:00:00.000Z' },
            { cycleIndex: 1, paidAt: '2026-05-01T08:00:00.000Z' },
          ],
        }),
      );

      expect(ledger.arrearsCount).toBe(1);
      expect(ledger.nextDueDate).toBe('2026-10-14');
    });

    it('reports no next due date and no arrears when every cycle is paid', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-05-01',
          paidCycles: [
            { cycleIndex: 0, paidAt: '2026-02-01T08:00:00.000Z' },
            { cycleIndex: 1, paidAt: '2026-04-20T08:00:00.000Z' },
          ],
        }),
      );

      expect(ledger.nextDueDate).toBeNull();
      expect(ledger.arrearsCount).toBe(0);
    });

    it('keeps arrears visible after the group is archived (EC-57)', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({
          startedAt: '2026-01-15',
          today: '2026-12-01',
          archivedAt: '2026-05-02',
        }),
      );

      expect(ledger.arrearsCount).toBe(2);
      expect(ledger.nextDueDate).toBe('2026-04-14');
    });
  });

  /**
   * ISS-14 fixture (SAS EC-55). A membership starting 30 November lands its
   * first cycle boundary in February, whose length differs by year — the one
   * case where the clamping convention is observable.
   */
  describe('30 November start — end-of-month clamping (ISS-14, EC-55)', () => {
    it('lands cycle 0 in a common-year February (2026: 28 days)', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({ startedAt: '2025-11-30', today: '2026-01-10' }),
      );

      expect(ledger.cycles).toEqual([
        {
          index: 0,
          startDate: '2025-11-30',
          // 30 Nov + 3 months clamps to 28 Feb 2026; the cycle ends the day
          // before, so cycle 1 starts exactly on 28 February — contiguous.
          endDate: '2026-02-27',
          status: 'Unpaid',
          paidAt: null,
        },
      ]);
      expect(ledger.nextDueDate).toBe('2026-02-27');
    });

    it('lands cycle 0 in a leap-year February (2028: 29 days)', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({ startedAt: '2027-11-30', today: '2028-01-10' }),
      );

      expect(ledger.cycles).toEqual([
        {
          index: 0,
          startDate: '2027-11-30',
          // 30 Nov + 3 months clamps to 29 Feb 2028 — one day later than the
          // common-year case, and never 1 March (clamp, not roll-forward).
          endDate: '2028-02-28',
          status: 'Unpaid',
          paidAt: null,
        },
      ]);
      expect(ledger.nextDueDate).toBe('2028-02-28');
    });

    it('opens Due Soon 10 days before the clamped end in both years', () => {
      expect(
        PaymentCycleDerivationService.derive(
          input({ startedAt: '2025-11-30', today: '2026-02-17' }),
        ).cycles[0].status,
      ).toBe('Due Soon');
      expect(
        PaymentCycleDerivationService.derive(
          input({ startedAt: '2025-11-30', today: '2026-02-16' }),
        ).cycles[0].status,
      ).toBe('Unpaid');

      expect(
        PaymentCycleDerivationService.derive(
          input({ startedAt: '2027-11-30', today: '2028-02-18' }),
        ).cycles[0].status,
      ).toBe('Due Soon');
      expect(
        PaymentCycleDerivationService.derive(
          input({ startedAt: '2027-11-30', today: '2028-02-17' }),
        ).cycles[0].status,
      ).toBe('Unpaid');
    });

    it('recovers the 30th on the following cycles — a clamp never accumulates', () => {
      const ledger = PaymentCycleDerivationService.derive(
        input({ startedAt: '2025-11-30', today: '2026-12-05' }),
      );

      expect(ledger.cycles.map((c) => [c.startDate, c.endDate])).toEqual([
        ['2025-11-30', '2026-02-27'],
        ['2026-02-28', '2026-05-29'],
        ['2026-05-30', '2026-08-29'],
        ['2026-08-30', '2026-11-29'],
        ['2026-11-30', '2027-02-27'],
      ]);
    });
  });
});
