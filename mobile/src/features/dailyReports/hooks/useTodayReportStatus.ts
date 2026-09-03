import { useQuery } from '@tanstack/react-query';
import {
  getTodayReportStatus,
  TodayReportStatusDto,
} from '@/shared/api/dailyReports.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key for the caller's today-report status (API-029) — the exact key
 * TS §26 names for `SubmitDailyReportUseCase`'s invalidation
 * (`['daily-reports','today']`). Exported so the submission mutation
 * (F-DR-02) can invalidate it — a successful submit flips the Home CTA to
 * "View Today's Report" (UF §10).
 */
export const TODAY_REPORT_STATUS_QUERY_KEY = [
  'daily-reports',
  'today',
] as const;

/**
 * Account-scoped query key for the authenticated user, preventing
 * cross-account cache leaks between sessions within staleTime.
 */
export function todayReportStatusQueryKey(userId?: string | null) {
  return [...TODAY_REPORT_STATUS_QUERY_KEY, userId ?? 'anonymous'] as const;
}

export interface UseTodayReportStatusOptions {
  /**
   * `false` keeps the query idle. SCR-08 sets it when the CTA's state has
   * already arrived on `GET /me/dashboard` (F-DASH-03), so Home does not ask
   * two endpoints the same question — see `ReportStatusCard`.
   */
  enabled?: boolean;
}

/**
 * Feature hook for the Student's today-report status (F-DR-01, SCR-08 CTA card,
 * SCR-09 gate). Adheres to TS.md §10/§26/§37 ("screens/components consume hooks,
 * never call the API client directly"). Inherits default QueryClient options
 * (5m staleTime, retry 1) from RootLayout.
 */
export function useTodayReportStatus({
  enabled = true,
}: UseTodayReportStatusOptions = {}) {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<TodayReportStatusDto, Error>({
    queryKey: todayReportStatusQueryKey(userId),
    queryFn: getTodayReportStatus,
    enabled,
  });
}
