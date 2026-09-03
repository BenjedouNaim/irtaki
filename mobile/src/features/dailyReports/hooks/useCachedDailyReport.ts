import { InfiniteData, useQueryClient } from '@tanstack/react-query';
import {
  DailyReportDto,
  ListOwnDailyReportsResponse,
  TodayReportStatusDto,
} from '@/shared/api/dailyReports.client';
import { useAuthStore } from '@/shared/auth';
import { ownDailyReportsQueryKey } from './useOwnDailyReports';
import { todayReportStatusQueryKey } from './useTodayReportStatus';

/**
 * Resolves a report id against data the app has ALREADY fetched — the own
 * history pages (`['daily-reports','mine']`, F-DR-05) and today's status
 * (`['daily-reports','today']`, F-DR-01 `existing_report`). SCR-15 has no
 * endpoint of its own (F-DR-07: "detail data comes from the row already
 * fetched by whichever list populated the tap"), so this never triggers a
 * request: it is a pure read of the TanStack cache (TS §26 server state).
 * `null` when the id is in neither cache (e.g. a cold deep link).
 */
export function useCachedDailyReport(
  id: string | undefined,
): DailyReportDto | null {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.userId);

  if (!id) {
    return null;
  }

  const history = queryClient.getQueryData<
    InfiniteData<ListOwnDailyReportsResponse>
  >(ownDailyReportsQueryKey(userId));
  const fromHistory = history?.pages
    .flatMap((page) => page.data)
    .find((report) => report.id === id);
  if (fromHistory) {
    return fromHistory;
  }

  const today = queryClient.getQueryData<TodayReportStatusDto>(
    todayReportStatusQueryKey(userId),
  );
  if (today?.existing_report?.id === id) {
    return today.existing_report;
  }

  return null;
}
