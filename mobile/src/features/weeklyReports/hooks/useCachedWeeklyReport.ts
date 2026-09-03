import { InfiniteData, useQueryClient } from '@tanstack/react-query';
import {
  WeeklyReportDto,
  WeeklyReportListResponse,
} from '@/shared/api/weeklyReports.client';
import { useAuthStore } from '@/shared/auth';
import { ownWeeklyReportsQueryKey } from './useOwnWeeklyReports';

/**
 * Resolves a weekly report id against the own-history pages the app has
 * ALREADY fetched (`['weekly-reports','mine']`, F-WR-03). The read-only
 * weekly detail has no endpoint of its own (UF §26: "Weekly sub-tab →
 * Detail (read-only)", the same F-DR-07 pattern as SCR-15 for daily rows),
 * so this never triggers a request: it is a pure read of the TanStack
 * cache (TS §26 server state). `null` when the id is not cached (e.g. a
 * cold deep link).
 */
export function useCachedWeeklyReport(
  id: string | undefined,
): WeeklyReportDto | null {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.userId);

  if (!id) {
    return null;
  }

  const pages = queryClient.getQueryData<
    InfiniteData<WeeklyReportListResponse>
  >(ownWeeklyReportsQueryKey(userId));

  return (
    pages?.pages
      .flatMap((page) => page.data)
      .find((report) => report.id === id) ?? null
  );
}
