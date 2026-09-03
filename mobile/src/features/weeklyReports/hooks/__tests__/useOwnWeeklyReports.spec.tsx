import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as weeklyReportsApi from '@/shared/api/weeklyReports.client';
import { ApiError } from '@/shared/api/types';
import {
  useOwnWeeklyReports,
  OWN_WEEKLY_REPORTS_QUERY_KEY,
  OWN_WEEKLY_REPORTS_PAGE_SIZE,
} from '../useOwnWeeklyReports';
import { CONFIRM_WEEKLY_REPORT_INVALIDATES } from '../useConfirmWeeklyReport';
import { useAuthStore } from '@/shared/auth';

jest.mock('@/shared/api/weeklyReports.client');

function report(
  id: string,
  week_start: string,
): weeklyReportsApi.WeeklyReportDto {
  return {
    id,
    week_start,
    week_end: week_start,
    expected_days: 6,
    missed_daily_reports: 1,
    missed_daily_memorization: 2,
    missed_daily_revision: 3,
    missed_50_repetitions: 4,
    missed_single_session: 5,
    attended_recitation_call: false,
    state: 'Finalised',
    finalised_at: `${week_start}T09:00:00.000Z`,
    finalised_by: 'Scheduler',
  };
}

const page1: weeklyReportsApi.WeeklyReportListResponse = {
  data: [report('w3', '2026-08-15'), report('w2', '2026-08-08')],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const page2: weeklyReportsApi.WeeklyReportListResponse = {
  data: [report('w1', '2026-08-01')],
  pagination: { next_cursor: null, has_more: false },
};

function renderUseOwnWeeklyReports() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useOwnWeeklyReports(), { wrapper });
  return { ...hook, queryClient };
}

describe('useOwnWeeklyReports (F-WR-03 / API-035)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable key ["weekly-reports","mine"] that the confirm mutation invalidates (TS §26, UF §16)', () => {
    expect(OWN_WEEKLY_REPORTS_QUERY_KEY).toEqual(['weekly-reports', 'mine']);
    expect(CONFIRM_WEEKLY_REPORT_INVALIDATES).toContainEqual(
      OWN_WEEKLY_REPORTS_QUERY_KEY,
    );
  });

  it('fetches the first page with limit=20 and no cursor, flattening rows in server order (UF §15)', async () => {
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockResolvedValue(page1);

    const { result, queryClient } = renderUseOwnWeeklyReports();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(OWN_WEEKLY_REPORTS_PAGE_SIZE).toBe(20);
    expect(weeklyReportsApi.listOwnWeeklyReports).toHaveBeenCalledTimes(1);
    expect(weeklyReportsApi.listOwnWeeklyReports).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(result.current.data?.map((r) => r.id)).toEqual(['w3', 'w2']);
    expect(result.current.hasNextPage).toBe(true);

    queryClient.clear();
  });

  it('fetches the next page with the server next_cursor and stops when has_more is false', async () => {
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const { result, queryClient } = renderUseOwnWeeklyReports();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data?.map((r) => r.id)).toEqual(['w3', 'w2', 'w1']),
    );
    expect(weeklyReportsApi.listOwnWeeklyReports).toHaveBeenLastCalledWith({
      limit: 20,
      cursor: 'cursor-2',
    });
    expect(result.current.hasNextPage).toBe(false);

    queryClient.clear();
  });

  it('surfaces the client error unchanged so consumers can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockRejectedValue(error);

    const { result, queryClient } = renderUseOwnWeeklyReports();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('scopes the query key to the authenticated user identity to prevent cross-account cache leaks', async () => {
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockResolvedValue(page2);
    act(() => {
      useAuthStore.setState({ userId: 'student-user-123' });
    });

    const { result, queryClient } = renderUseOwnWeeklyReports();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['weekly-reports', 'mine', 'student-user-123']),
    ).toBeTruthy();
    expect(
      queryClient.getQueryData(['weekly-reports', 'mine', 'anonymous']),
    ).toBeUndefined();

    queryClient.clear();
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });
});
