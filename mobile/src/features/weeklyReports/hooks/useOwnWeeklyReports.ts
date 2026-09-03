import { useInfiniteQuery } from '@tanstack/react-query';
import {
  listOwnWeeklyReports,
  WeeklyReportListResponse,
} from '@/shared/api/weeklyReports.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key of the Student's own weekly history (API-035, SCR-14 Weekly
 * sub-tab) — the key the confirm mutation (F-WR-02) invalidates so a
 * finalised week "appears in History" (UF §16, TS §26).
 */
export const OWN_WEEKLY_REPORTS_QUERY_KEY = ['weekly-reports', 'mine'] as const;

/** UF §15 Report History: "Cursor-paginated infinite scroll (`limit=20`)". */
export const OWN_WEEKLY_REPORTS_PAGE_SIZE = 20;

/**
 * Account-scoped query key for the authenticated user, preventing
 * cross-account cache leaks between sessions within staleTime.
 */
export function ownWeeklyReportsQueryKey(userId?: string | null) {
  return [...OWN_WEEKLY_REPORTS_QUERY_KEY, userId ?? 'anonymous'] as const;
}

export type OwnWeeklyReportsQueryKey = ReturnType<
  typeof ownWeeklyReportsQueryKey
>;

/**
 * Feature hook for SCR-14's Weekly sub-tab (F-WR-03): the caller's own
 * finalised weeks (API-035) as one infinite query — page param = the
 * opaque `next_cursor` (APIS §9.2), `undefined` for the first page, none
 * once `has_more` is false. Pages stay in the TanStack cache (TS §26
 * server state) so the read-only detail can render a tapped row without a
 * second request, as SCR-15 does for daily rows. Inherits default
 * QueryClient options (5m staleTime, retry 1) from RootLayout.
 */
export function useOwnWeeklyReports() {
  const userId = useAuthStore((s) => s.userId);
  return useInfiniteQuery<
    WeeklyReportListResponse,
    Error,
    WeeklyReportListResponse['data'],
    OwnWeeklyReportsQueryKey,
    string | undefined
  >({
    queryKey: ownWeeklyReportsQueryKey(userId),
    queryFn: ({ pageParam }) =>
      listOwnWeeklyReports({
        limit: OWN_WEEKLY_REPORTS_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more && lastPage.pagination.next_cursor
        ? lastPage.pagination.next_cursor
        : undefined,
    // Flatten the pages: consumers only ever want the rows in order.
    select: (result) => result.pages.flatMap((page) => page.data),
  });
}
