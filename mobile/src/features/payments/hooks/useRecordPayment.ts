import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PaymentRecordDto, recordPayment } from '@/shared/api/payments.client';
import { ApiError } from '@/shared/api/types';
import { GROUP_PAYMENTS_QUERY_KEY } from './useGroupPayments';
import { MY_PAYMENTS_QUERY_KEY } from './useMyPayments';

/**
 * Query keys one recording invalidates (TS §26 — declared once, the single
 * source of truth for "what this write affects"): every status slice of
 * every group ledger (a new PaymentRecord moves the student's badge, their
 * arrears count and which SCR-20 chip they fall under) and the Student's
 * own ledger, whose every derived figure changes with it.
 */
export const RECORD_PAYMENT_INVALIDATES = [
  GROUP_PAYMENTS_QUERY_KEY,
  MY_PAYMENTS_QUERY_KEY,
] as const;

export interface RecordPaymentVariables {
  membershipId: string;
  /** 0-based, exactly as the ledger returned it. */
  cycleIndex: number;
}

/**
 * Outcome of one recording. A `409 CYCLE_ALREADY_PAID` is NOT an error
 * (UF §18: "Concurrent recording — Toast, row refreshes, no error tone"):
 * another Assistant already recorded this very cycle, which is the state
 * the caller wanted, so the mutation resolves and the screen re-reads the
 * now-Paid row through the invalidated query.
 */
export type RecordPaymentOutcome =
  { kind: 'recorded'; record: PaymentRecordDto } | { kind: 'already_paid' };

async function recordOrAcceptPaid(
  variables: RecordPaymentVariables,
): Promise<RecordPaymentOutcome> {
  try {
    const record = await recordPayment(variables.membershipId, {
      cycle_index: variables.cycleIndex,
    });
    return { kind: 'recorded', record };
  } catch (err: unknown) {
    if (
      err instanceof ApiError &&
      err.statusCode === 409 &&
      err.errorCode === 'CYCLE_ALREADY_PAID'
    ) {
      return { kind: 'already_paid' };
    }
    throw err;
  }
}

/**
 * Feature hook for "Mark as Paid" (F-PAY-03, SCR-21, API-047). TanStack
 * mutation per TS §26 — screens never call the API client directly.
 *
 * The 30 TND amount is nowhere in this file: BR-31 fixes it server-side and
 * the request carries `cycle_index` alone. Every other error
 * (`422 FUTURE_CYCLE`, `403`, `5xx`, network) is surfaced unchanged for the
 * screen to map per UF §18's state table.
 *
 * There is no matching "undo" mutation, and there never will be: no
 * endpoint exists to reverse or correct a recorded payment (ISS-02).
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation<RecordPaymentOutcome, Error, RecordPaymentVariables>({
    mutationFn: recordOrAcceptPaid,
    onSuccess: async () => {
      await Promise.all(
        RECORD_PAYMENT_INVALIDATES.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
    },
  });
}
