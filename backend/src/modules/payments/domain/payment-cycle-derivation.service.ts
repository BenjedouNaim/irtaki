import { addDays } from '../../reports/domain/local-date';
import {
  DUE_SOON_WINDOW_DAYS,
  PaymentCycle,
  PaymentCycleStatus,
  cycleStartDate,
  paymentCycle,
} from './payment-cycle';

/** One `payment_records` row as the derivation needs it (E-07, DBT-08). */
export interface PaidCycle {
  cycleIndex: number;
  /** ISO-8601 instant. */
  paidAt: string;
}

export interface DeriveLedgerInput {
  /** `C0` — `memberships.started_at` (BR-32, FR-PAY-02). */
  startedAt: string;
  /** Today as a calendar date in the **student's** timezone (T-01, INV-27). */
  today: string;
  /** `memberships.ended_at`, `null` while Active (FR-PAY-12). */
  endedAt: string | null;
  /** `groups.archived_at` as a calendar date, `null` while Active (FR-PAY-12). */
  archivedAt: string | null;
  paidCycles: readonly PaidCycle[];
}

export interface DerivedPaymentCycle extends PaymentCycle {
  status: PaymentCycleStatus;
  /** ISO-8601 instant when `status` is `Paid`; `null` otherwise. */
  paidAt: string | null;
}

export interface DerivedPaymentLedger {
  cycles: DerivedPaymentCycle[];
  /** End of the earliest cycle that is not `Paid` (DEC-B06); `null` if none. */
  nextDueDate: string | null;
  /** Past cycles that are not `Paid` (FR-PAY-10). */
  arrearsCount: number;
}

/**
 * DS-06 `PaymentCycleDerivationService` (DMS §16/§23, SAS §18.5, TS §25).
 *
 * Pure, read-time derivation of the whole ledger from `Membership.started_at`
 * and the `PaymentRecord` rows that happen to exist. **Nothing about a cycle
 * is ever persisted** (ADR-006): `Unpaid` is the absence of a row for a cycle
 * index the arithmetic says should exist by now.
 *
 * ```
 * cycle(i)      = [ C0 + 3i months , C0 + 3(i+1) months − 1 day ]   (ISS-14: clamped)
 * cycle_count   = |{ i : cycle(i).start ≤ min(today, ended_at, archived_at) }|   FR-PAY-12
 * status(i)     = Paid      if a PaymentRecord exists
 *               = Due Soon  if i is the current cycle and today ≥ end − 10d   BR-33, BR-55
 *               = Unpaid    otherwise
 * next_due_date = cycle( min{ i : status(i) ≠ Paid } ).end                      DEC-B06
 * arrears_count = |{ i : status(i) ≠ Paid ∧ cycle(i).end < today }|             FR-PAY-10
 * ```
 *
 * Framework-free (TS §9), no I/O — the caller supplies every input.
 */
export class PaymentCycleDerivationService {
  static derive(input: DeriveLedgerInput): DerivedPaymentLedger {
    const paidByIndex = new Map(
      input.paidCycles.map((paid) => [paid.cycleIndex, paid.paidAt]),
    );
    const horizon = PaymentCycleDerivationService.generationHorizon(input);
    const cycles: DerivedPaymentCycle[] = [];

    // FR-PAY-09: cycles advance irrespective of payment, so arrears
    // accumulate; FR-PAY-12/DEC-C03: generation stops at termination or
    // group archival, it does not reach today past either.
    for (
      let index = 0;
      cycleStartDate(input.startedAt, index) <= horizon;
      index += 1
    ) {
      const cycle = paymentCycle(input.startedAt, index);
      const paidAt = paidByIndex.get(index) ?? null;
      cycles.push({
        ...cycle,
        status: PaymentCycleDerivationService.statusOf(cycle, paidAt, input),
        paidAt,
      });
    }

    const earliestUnpaid = cycles.find((cycle) => cycle.status !== 'Paid');

    return {
      cycles,
      nextDueDate: earliestUnpaid ? earliestUnpaid.endDate : null,
      arrearsCount: cycles.filter(
        (cycle) => cycle.status !== 'Paid' && cycle.endDate < input.today,
      ).length,
    };
  }

  /**
   * `min(today, ended_at, archived_at)` — the last date a cycle may start on
   * (SAS §18.5's `cycle_count` bound, FR-PAY-12).
   */
  private static generationHorizon(input: DeriveLedgerInput): string {
    return [input.today, input.endedAt, input.archivedAt]
      .filter((date): date is string => date !== null)
      .reduce((earliest, date) => (date < earliest ? date : earliest));
  }

  private static statusOf(
    cycle: PaymentCycle,
    paidAt: string | null,
    input: DeriveLedgerInput,
  ): PaymentCycleStatus {
    if (paidAt !== null) {
      return 'Paid';
    }
    // BR-55 / FR-PAY-10: `Due Soon` is a property of the CURRENT cycle only.
    // An older unpaid cycle stays `Unpaid` and is surfaced by arrears_count.
    const isCurrent =
      cycle.startDate <= input.today && input.today <= cycle.endDate;
    const dueSoonFrom = addDays(cycle.endDate, -DUE_SOON_WINDOW_DAYS);
    return isCurrent && input.today >= dueSoonFrom ? 'Due Soon' : 'Unpaid';
  }
}
