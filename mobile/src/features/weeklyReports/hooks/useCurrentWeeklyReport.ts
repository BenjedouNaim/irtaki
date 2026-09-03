import { useQuery } from '@tanstack/react-query';
import {
  getCurrentWeeklyReport,
  WeeklyReportLiveDto,
} from '@/shared/api/weeklyReports.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key for the caller's current-week report (API-033). Exported so a
 * daily-report submission (F-DR-02) can invalidate it — a new report
 * changes the live weekly view (TS §26) — and so F-WR-02's confirm
 * mutation can refresh it once the row is finalised.
 */
export const CURRENT_WEEKLY_REPORT_QUERY_KEY = [
  'weekly-reports',
  'current',
] as const;

/**
 * Account-scoped query key for the authenticated user, preventing
 * cross-account cache leaks between sessions within staleTime.
 */
export function currentWeeklyReportQueryKey(userId?: string | null) {
  return [...CURRENT_WEEKLY_REPORT_QUERY_KEY, userId ?? 'anonymous'] as const;
}

/**
 * Feature hook for the Student's current-week report (F-WR-01, SCR-12 and
 * the SCR-08 live card). Adheres to TS §10/§26/§37 ("screens/components
 * consume hooks, never call the API client directly"). Inherits default
 * QueryClient options (5m staleTime, retry 1) from RootLayout.
 */
export function useCurrentWeeklyReport() {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<WeeklyReportLiveDto, Error>({
    queryKey: currentWeeklyReportQueryKey(userId),
    queryFn: getCurrentWeeklyReport,
  });
}
