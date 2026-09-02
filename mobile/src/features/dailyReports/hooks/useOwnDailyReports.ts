import { useInfiniteQuery } from '@tanstack/react-query';
import {
  listOwnDailyReports,
  ListOwnDailyReportsResponse,
} from '@/shared/api/dailyReports.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key for the caller's own daily report history (API-031) — the exact
 * key TS §26 names for `SubmitDailyReportUseCase`'s invalidation
 * (`['daily-reports','mine']`).
 */
export const OWN_DAILY_REPORTS_QUERY_KEY = ['daily-reports', 'mine'] as const;

/** UF §15 Report History: "Cursor-paginated infinite scroll (`limit=20`)". */
export const OWN_DAILY_REPORTS_PAGE_SIZE = 20;

/**
 * Account-scoped query key for the authenticated user, preventing
 * cross-account cache leaks between sessions within staleTime.
 */
export function ownDailyReportsQueryKey(userId?: string | null) {
  return [...OWN_DAILY_REPORTS_QUERY_KEY, userId ?? 'anonymous'] as const;
}

/**
 * Feature hook for SCR-14's Daily sub-tab (F-DR-05): an infinite query whose
 * page param is the opaque `next_cursor` (APIS §9.2); `undefined` for the
 * first page, `null` once `has_more` is false. Pages are kept in the
 * TanStack cache (TS §26 server state) so SCR-15 can render a tapped row
 * from the already-fetched data without a second request (F-DR-07).
 * Inherits default QueryClient options (5m staleTime, retry 1) from
 * RootLayout.
 */
export function useOwnDailyReports() {
  const userId = useAuthStore((s) => s.userId);
  return useInfiniteQuery<
    ListOwnDailyReportsResponse,
    Error,
    ListOwnDailyReportsResponse['data'],
    ReturnType<typeof ownDailyReportsQueryKey>,
    string | undefined
  >({
    queryKey: ownDailyReportsQueryKey(userId),
    queryFn: ({ pageParam }) =>
      listOwnDailyReports({
        limit: OWN_DAILY_REPORTS_PAGE_SIZE,
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
