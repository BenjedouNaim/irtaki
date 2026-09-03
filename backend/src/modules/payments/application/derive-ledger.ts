import { localDateInTimezone } from '../../reports/domain/local-date';
import {
  DerivedPaymentLedger,
  PaymentCycleDerivationService,
} from '../domain/payment-cycle-derivation.service';
import {
  OwnLedgerContextRecord,
  PaidCycleRecord,
} from '../domain/payment.repository.interface';

/**
 * Runs DS-06 over one membership's context (SAS §18.5). Shared verbatim by
 * API-045's own ledger and API-046's per-student group ledgers — APIS
 * §10.11 defines the second as "the same per-student ledgers for a group",
 * so there is exactly one derivation call site shape, not two.
 *
 * "Today" is the calendar date in the **student's own** `users.timezone`
 * (T-01, INV-27) — a cycle boundary and the 10-day `Due Soon` window are
 * day-boundary judgements, so they follow the same clock as every other
 * date in the product, per student and never the center's.
 */
export function deriveLedgerForMembership(
  context: OwnLedgerContextRecord,
  paidCycles: readonly PaidCycleRecord[],
  now: Date,
): DerivedPaymentLedger {
  return PaymentCycleDerivationService.derive({
    startedAt: context.startedAt,
    today: localDateInTimezone(now, context.timezone),
    endedAt: context.endedAt,
    archivedAt: archivedAtLocalDate(context),
    paidCycles,
  });
}

/**
 * `groups.archived_at` (an instant) as a calendar date in the student's own
 * timezone (DEC-B03) — the FR-PAY-12 stop is a day boundary, not an instant.
 */
function archivedAtLocalDate(context: OwnLedgerContextRecord): string | null {
  return context.archivedAt
    ? localDateInTimezone(new Date(context.archivedAt), context.timezone)
    : null;
}
