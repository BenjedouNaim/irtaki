import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  getMyDashboard,
  type DashboardDto,
} from '@/shared/api/dashboard.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key root for API-009 (`['me','dashboard']`). Exported so a mutation
 * that changes what a home screen shows can invalidate it — submitting a
 * daily report flips the Student CTA, recording a payment moves an
 * Assistant's follow-up count (TS §26).
 */
export const DASHBOARD_QUERY_KEY = ['me', 'dashboard'] as const;

/** Account-scoped key — no dashboard may leak across sessions. */
export function dashboardQueryKey(userId?: string | null) {
  return [...DASHBOARD_QUERY_KEY, userId ?? 'anonymous'] as const;
}

/**
 * F-DASH-03's single home read (F-DASH-01 / API-009). One query per home
 * screen, whatever the role: SA §20's "one round trip" is only true on the
 * client if the client makes one call.
 *
 * The type parameter names the arm the caller's own role receives. That is
 * safe rather than a guess: the server keys the payload off the session's
 * role (never a client assertion), and F-DASH-02 only ever mounts a role's
 * Home for that role — so a correctly-routed screen cannot be handed another
 * role's arm.
 */
export function useDashboard<
  T extends DashboardDto = DashboardDto,
>(): UseQueryResult<T, Error> {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<T, Error>({
    queryKey: dashboardQueryKey(userId),
    queryFn: getMyDashboard as () => Promise<T>,
  });
}
