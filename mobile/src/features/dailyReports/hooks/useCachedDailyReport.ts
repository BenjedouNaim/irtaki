import { InfiniteData, useQueryClient } from '@tanstack/react-query';
import {
  DailyReportDto,
  DailyReportListResponse,
  TodayReportStatusDto,
} from '@/shared/api/dailyReports.client';
import { useAuthStore } from '@/shared/auth';
import {
  membershipDailyReportsQueryKey,
  ownDailyReportsQueryKey,
} from './useDailyReportsList';
import { todayReportStatusQueryKey } from './useTodayReportStatus';

function findInPages(
  pages: InfiniteData<DailyReportListResponse> | undefined,
  id: string,
): DailyReportDto | undefined {
  return pages?.pages
    .flatMap((page) => page.data)
    .find((report) => report.id === id);
}

/**
 * Resolves a report id against data the app has ALREADY fetched — a
 * membership's staff list (`['daily-reports','membership', id]`, F-DR-06)
 * when `membershipId` is given, the own history pages
 * (`['daily-reports','mine']`, F-DR-05) and today's status
 * (`['daily-reports','today']`, F-DR-01 `existing_report`). SCR-15 has no
 * endpoint of its own (F-DR-07: "detail data comes from the row already
 * fetched by whichever list populated the tap"), so this never triggers a
 * request: it is a pure read of the TanStack cache (TS §26 server state).
 * `null` when the id is in none of them (e.g. a cold deep link).
 */
export function useCachedDailyReport(
  id: string | undefined,
  membershipId?: string,
): DailyReportDto | null {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.userId);

  if (!id) {
    return null;
  }

  if (membershipId) {
    const fromStaffList = findInPages(
      queryClient.getQueryData<InfiniteData<DailyReportListResponse>>(
        membershipDailyReportsQueryKey(membershipId, userId),
      ),
      id,
    );
    if (fromStaffList) {
      return fromStaffList;
    }
  }

  const fromHistory = findInPages(
    queryClient.getQueryData<InfiniteData<DailyReportListResponse>>(
      ownDailyReportsQueryKey(userId),
    ),
    id,
  );
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
