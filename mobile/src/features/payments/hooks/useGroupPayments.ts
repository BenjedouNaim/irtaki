import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getGroupPayments,
  GroupStudentLedgerDto,
  PaymentCycleStatus,
} from '@/shared/api/payments.client';

/**
 * Query key root for a group's payment ledgers (API-046). Exported so the
 * Assistant's "Mark as Paid" mutation (F-PAY-03) can invalidate every
 * status slice of a group at once — a new PaymentRecord changes the badge,
 * the arrears count and which chip the student falls under (TS §26).
 */
export const GROUP_PAYMENTS_QUERY_KEY = ['payments', 'group'] as const;

/** The filter chip that is showing; `undefined` is SCR-20's "All". */
export type GroupPaymentsFilter = PaymentCycleStatus | undefined;

export function groupPaymentsQueryKey(
  groupId: string | null | undefined,
  status: GroupPaymentsFilter,
) {
  return [
    ...GROUP_PAYMENTS_QUERY_KEY,
    groupId ?? 'none',
    status ?? 'all',
  ] as const;
}

/**
 * Feature hook for SCR-20's ledger list (F-PAY-02). The status filter is
 * part of the key, so switching a chip is a separate cached read rather
 * than a client-side re-filter — the server owns the derivation (ADR-006)
 * and therefore the filter too (FR-PAY-06).
 *
 * The previous slice is kept while the next one loads, so pressing a chip
 * or switching group never blanks the screen back to a skeleton — UF §22's
 * skeletons stand in for a first load, not for every filter change.
 *
 * Disabled until a group is selected: the Assistant may have none assigned.
 * Adheres to TS §10/§26/§37 ("screens/components consume hooks, never call
 * the API client directly").
 */
export function useGroupPayments(
  groupId: string | null | undefined,
  status: GroupPaymentsFilter,
) {
  return useQuery<GroupStudentLedgerDto[], Error>({
    queryKey: groupPaymentsQueryKey(groupId, status),
    queryFn: () => getGroupPayments(groupId as string, { status }),
    enabled: Boolean(groupId),
    placeholderData: keepPreviousData,
  });
}
