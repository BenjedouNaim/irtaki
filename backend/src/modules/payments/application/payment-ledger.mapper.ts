import {
  DerivedPaymentCycle,
  DerivedPaymentLedger,
} from '../domain/payment-cycle-derivation.service';
import {
  GroupStudentLedgerDto,
  PaymentCycleDto,
  PaymentLedgerDto,
} from './payment-ledger.dto';

/** DS-06's derived cycle in the APIS §10.11 wire shape. */
export function toPaymentCycleDto(cycle: DerivedPaymentCycle): PaymentCycleDto {
  return {
    index: cycle.index,
    start_date: cycle.startDate,
    end_date: cycle.endDate,
    status: cycle.status,
    // `paid_at?` — the key exists only on a cycle that was actually paid.
    ...(cycle.paidAt !== null ? { paid_at: cycle.paidAt } : {}),
  };
}

export function toPaymentLedgerDto(
  ledger: DerivedPaymentLedger,
): PaymentLedgerDto {
  return {
    cycles: ledger.cycles.map(toPaymentCycleDto),
    next_due_date: ledger.nextDueDate,
    arrears_count: ledger.arrearsCount,
  };
}

/**
 * One group member's derived ledger in the API-046 wire shape: the
 * `PaymentLedgerDto` body plus the student identity the ledger row names.
 */
export function toGroupStudentLedgerDto(
  member: { membershipId: string; fullName: string | null },
  ledger: DerivedPaymentLedger,
): GroupStudentLedgerDto {
  return {
    membership_id: member.membershipId,
    full_name: member.fullName,
    ...toPaymentLedgerDto(ledger),
  };
}
