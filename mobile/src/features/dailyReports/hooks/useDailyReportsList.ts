import { useInfiniteQuery } from '@tanstack/react-query';
import {
  DailyReportListResponse,
  listMembershipDailyReports,
  listOwnDailyReports,
} from '@/shared/api/dailyReports.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Where a daily-report list comes from: the caller's own history (API-031,
 * SCR-14) or one membership seen as staff (API-032, SCR-25). Same page
 * shape either way (APIS §10.7), so one query implementation serves both.
 */
export type DailyReportsSource =
  { kind: 'own' } | { kind: 'membership'; membershipId: string };

/**
 * Query key for the caller's own daily report history (API-031) — the exact
 * key TS §26 names for `SubmitDailyReportUseCase`'s invalidation
 * (`['daily-reports','mine']`).
 */
export const OWN_DAILY_REPORTS_QUERY_KEY = ['daily-reports', 'mine'] as const;

/** Query key prefix for a membership's raw report list seen as staff (API-032). */
export const MEMBERSHIP_DAILY_REPORTS_QUERY_KEY = [
  'daily-reports',
  'membership',
] as const;

/** UF §15 Report History: "Cursor-paginated infinite scroll (`limit=20`)". */
export const DAILY_REPORTS_PAGE_SIZE = 20;

/**
 * Account-scoped query key for the authenticated user, preventing
 * cross-account cache leaks between sessions within staleTime.
 */
export function ownDailyReportsQueryKey(userId?: string | null) {
  return [...OWN_DAILY_REPORTS_QUERY_KEY, userId ?? 'anonymous'] as const;
}

/**
 * Keyed by membership AND viewer (TS §26 "keyed by endpoint+params"): two
 * students never share a page, and a page fetched by one staff account is
 * never shown to another.
 */
export function membershipDailyReportsQueryKey(
  membershipId: string,
  userId?: string | null,
) {
  return [
    ...MEMBERSHIP_DAILY_REPORTS_QUERY_KEY,
    membershipId,
    userId ?? 'anonymous',
  ] as const;
}

export function dailyReportsQueryKey(
  source: DailyReportsSource,
  userId?: string | null,
) {
  return source.kind === 'own'
    ? ownDailyReportsQueryKey(userId)
    : membershipDailyReportsQueryKey(source.membershipId, userId);
}

export type DailyReportsQueryKey = ReturnType<typeof dailyReportsQueryKey>;

function fetchPage(
  source: DailyReportsSource,
  cursor: string | undefined,
): Promise<DailyReportListResponse> {
  const params = {
    limit: DAILY_REPORTS_PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
  };
  return source.kind === 'own'
    ? listOwnDailyReports(params)
    : listMembershipDailyReports(source.membershipId, params);
}

/**
 * The one infinite query behind SCR-14's Daily sub-tab (F-DR-05) and SCR-25
 * (F-DR-06): page param = the opaque `next_cursor` (APIS §9.2), `undefined`
 * for the first page, none once `has_more` is false. Pages stay in the
 * TanStack cache (TS §26 server state) so SCR-15 can render a tapped row
 * from the already-fetched data without a second request (F-DR-07).
 * Inherits default QueryClient options (5m staleTime, retry 1) from
 * RootLayout.
 */
export function useDailyReportsList(source: DailyReportsSource) {
  const userId = useAuthStore((s) => s.userId);
  return useInfiniteQuery<
    DailyReportListResponse,
    Error,
    DailyReportListResponse['data'],
    DailyReportsQueryKey,
    string | undefined
  >({
    queryKey: dailyReportsQueryKey(source, userId),
    queryFn: ({ pageParam }) => fetchPage(source, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more && lastPage.pagination.next_cursor
        ? lastPage.pagination.next_cursor
        : undefined,
    // Flatten the pages: consumers only ever want the rows in order.
    select: (result) => result.pages.flatMap((page) => page.data),
  });
}
