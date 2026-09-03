import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as weeklyReportsApi from '@/shared/api/weeklyReports.client';
import { ApiError } from '@/shared/api/types';
import {
  useCurrentWeeklyReport,
  CURRENT_WEEKLY_REPORT_QUERY_KEY,
} from '../useCurrentWeeklyReport';
import { useAuthStore } from '@/shared/auth';

jest.mock('@/shared/api/weeklyReports.client');

const liveReport: weeklyReportsApi.WeeklyReportLiveDto = {
  id: null,
  week_start: '2026-08-29',
  week_end: '2026-09-04',
  expected_days: 5,
  missed_daily_reports: 2,
  missed_daily_memorization: 2,
  missed_daily_revision: 3,
  missed_50_repetitions: 1,
  missed_single_session: 0,
  attended_recitation_call: false,
  state: 'Open',
  can_confirm: false,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

function renderUseCurrentWeeklyReport() {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useCurrentWeeklyReport(), { wrapper });
  return { ...hook, queryClient };
}

describe('useCurrentWeeklyReport (F-WR-01 / API-033)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable query key ["weekly-reports","current"] for invalidation (TS §26)', () => {
    expect(CURRENT_WEEKLY_REPORT_QUERY_KEY).toEqual([
      'weekly-reports',
      'current',
    ]);
  });

  it('wires getCurrentWeeklyReport as the queryFn under that key and resolves the DTO', async () => {
    jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockResolvedValue(liveReport);

    const { result, queryClient } = renderUseCurrentWeeklyReport();

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(weeklyReportsApi.getCurrentWeeklyReport).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(liveReport);
    expect(
      queryClient.getQueryData(['weekly-reports', 'current', 'anonymous']),
    ).toEqual(liveReport);

    queryClient.clear();
  });

  it('surfaces the client error unchanged so consumers can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockRejectedValue(error);

    const { result, queryClient } = renderUseCurrentWeeklyReport();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('refetch() calls getCurrentWeeklyReport again', async () => {
    jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockResolvedValue(liveReport);

    const { result, queryClient } = renderUseCurrentWeeklyReport();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();

    expect(weeklyReportsApi.getCurrentWeeklyReport).toHaveBeenCalledTimes(2);

    queryClient.clear();
  });

  it('scopes the query key to the authenticated user identity', async () => {
    jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockResolvedValue(liveReport);
    act(() => {
      useAuthStore.setState({ userId: 'student-user-123' });
    });

    const { result, queryClient } = renderUseCurrentWeeklyReport();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData([
        'weekly-reports',
        'current',
        'student-user-123',
      ]),
    ).toEqual(liveReport);
    expect(
      queryClient.getQueryData(['weekly-reports', 'current', 'other-user']),
    ).toBeUndefined();

    queryClient.clear();
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });
});
