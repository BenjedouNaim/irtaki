import { useQuery } from '@tanstack/react-query';
import { getMyPayments, PaymentLedgerDto } from '@/shared/api/payments.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key for the caller's own payment ledger (API-045). Exported so the
 * Assistant's "Mark as Paid" mutation (F-PAY-03) can invalidate it — a new
 * PaymentRecord changes every derived figure on this screen (TS §26).
 */
export const MY_PAYMENTS_QUERY_KEY = ['payments', 'mine'] as const;

/**
 * Account-scoped query key for the authenticated user, preventing
 * cross-account cache leaks between sessions within staleTime.
 */
export function myPaymentsQueryKey(userId?: string | null) {
  return [...MY_PAYMENTS_QUERY_KEY, userId ?? 'anonymous'] as const;
}

/**
 * Feature hook for the Student's own derived payment ledger (F-PAY-01,
 * SCR-16). Adheres to TS §10/§26/§37 ("screens/components consume hooks,
 * never call the API client directly"). Inherits default QueryClient
 * options (5m staleTime, retry 1) from RootLayout.
 */
export function useMyPayments() {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<PaymentLedgerDto, Error>({
    queryKey: myPaymentsQueryKey(userId),
    queryFn: getMyPayments,
  });
}
