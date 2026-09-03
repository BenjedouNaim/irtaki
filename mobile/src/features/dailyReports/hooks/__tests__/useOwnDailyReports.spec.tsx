import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { ApiError } from '@/shared/api/types';
import {
  useOwnDailyReports,
  OWN_DAILY_REPORTS_QUERY_KEY,
  OWN_DAILY_REPORTS_PAGE_SIZE,
} from '../useOwnDailyReports';
import { SUBMIT_DAILY_REPORT_INVALIDATES } from '../useSubmitDailyReport';
import { useAuthStore } from '@/shared/auth';

jest.mock('@/shared/api/dailyReports.client');

function report(
  id: string,
  report_date: string,
): dailyReportsApi.DailyReportDto {
  return {
    id,
    report_date,
    type: 'Absent',
    submitted_at: `${report_date}T08:30:00.000Z`,
    submitted_timezone: 'Africa/Tunis',
    no_memorization_today: null,
    memo_range: null,
    memo_time: null,
    completed_50_repetitions: null,
    repetitions_in_single_session: null,
    no_revision_today: null,
    rev_range: null,
    rev_time: null,
    read_tafsir: null,
    absence_reason: 'Sick',
  };
}

const page1: dailyReportsApi.ListOwnDailyReportsResponse = {
  data: [report('r3', '2026-08-03'), report('r2', '2026-08-02')],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const page2: dailyReportsApi.ListOwnDailyReportsResponse = {
  data: [report('r1', '2026-08-01')],
  pagination: { next_cursor: null, has_more: false },
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function renderUseOwnDailyReports() {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useOwnDailyReports(), { wrapper });
  return { ...hook, queryClient };
}

describe('useOwnDailyReports (F-DR-05 / API-031)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable key ["daily-reports","mine"] that the submit mutation invalidates (TS §26)', () => {
    expect(OWN_DAILY_REPORTS_QUERY_KEY).toEqual(['daily-reports', 'mine']);
    expect(SUBMIT_DAILY_REPORT_INVALIDATES).toContainEqual(
      OWN_DAILY_REPORTS_QUERY_KEY,
    );
  });

  it('fetches the first page with limit=20 and no cursor, flattening rows in server order (UF §15)', async () => {
    jest.spyOn(dailyReportsApi, 'listOwnDailyReports').mockResolvedValue(page1);

    const { result, queryClient } = renderUseOwnDailyReports();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(OWN_DAILY_REPORTS_PAGE_SIZE).toBe(20);
    expect(dailyReportsApi.listOwnDailyReports).toHaveBeenCalledTimes(1);
    expect(dailyReportsApi.listOwnDailyReports).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(result.current.data?.map((r) => r.id)).toEqual(['r3', 'r2']);
    expect(result.current.hasNextPage).toBe(true);
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: OWN_DAILY_REPORTS_QUERY_KEY, exact: false }),
    ).toBeTruthy();

    queryClient.clear();
  });

  it('fetches the next page with the server next_cursor and stops when has_more is false', async () => {
    jest
      .spyOn(dailyReportsApi, 'listOwnDailyReports')
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const { result, queryClient } = renderUseOwnDailyReports();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data?.map((r) => r.id)).toEqual(['r3', 'r2', 'r1']),
    );
    expect(dailyReportsApi.listOwnDailyReports).toHaveBeenLastCalledWith({
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
    jest.spyOn(dailyReportsApi, 'listOwnDailyReports').mockRejectedValue(error);

    const { result, queryClient } = renderUseOwnDailyReports();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('scopes the query key to the authenticated user identity to prevent cross-account cache leaks', async () => {
    jest.spyOn(dailyReportsApi, 'listOwnDailyReports').mockResolvedValue(page2);
    act(() => {
      useAuthStore.setState({ userId: 'student-user-123' });
    });

    const { result, queryClient } = renderUseOwnDailyReports();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['daily-reports', 'mine', 'student-user-123']),
    ).toBeTruthy();
    expect(
      queryClient.getQueryData(['daily-reports', 'mine', 'anonymous']),
    ).toBeUndefined();

    queryClient.clear();
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });
});
