import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { ApiError } from '@/shared/api/types';
import {
  useTodayReportStatus,
  TODAY_REPORT_STATUS_QUERY_KEY,
} from '../useTodayReportStatus';
import { useAuthStore } from '@/shared/auth';

jest.mock('@/shared/api/dailyReports.client');

const mockStatus: dailyReportsApi.TodayReportStatusDto = {
  can_submit: false,
  block_reason: 'recitation_day',
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

function renderUseTodayReportStatus() {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useTodayReportStatus(), { wrapper });
  return { ...hook, queryClient };
}

describe('useTodayReportStatus (F-DR-01 / API-029)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable query key ["dailyReports","today"] for mutation invalidation (TS §26)', () => {
    expect(TODAY_REPORT_STATUS_QUERY_KEY).toEqual(['dailyReports', 'today']);
  });

  it('wires getTodayReportStatus as the queryFn under that key and resolves the DTO', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue(mockStatus);

    const { result, queryClient } = renderUseTodayReportStatus();

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(dailyReportsApi.getTodayReportStatus).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockStatus);
    expect(
      queryClient.getQueryData(['dailyReports', 'today', 'anonymous']),
    ).toEqual(mockStatus);
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: TODAY_REPORT_STATUS_QUERY_KEY, exact: false }),
    ).toBeTruthy();

    queryClient.clear();
  });

  it('surfaces the client error unchanged so consumers can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockRejectedValue(error);

    const { result, queryClient } = renderUseTodayReportStatus();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('refetch() calls getTodayReportStatus again', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue(mockStatus);

    const { result, queryClient } = renderUseTodayReportStatus();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();

    expect(dailyReportsApi.getTodayReportStatus).toHaveBeenCalledTimes(2);

    queryClient.clear();
  });

  it('scopes the query key to the authenticated user identity to prevent cross-account cache leaks', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue(mockStatus);
    act(() => {
      useAuthStore.setState({ userId: 'student-user-123' });
    });

    const { result, queryClient } = renderUseTodayReportStatus();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['dailyReports', 'today', 'student-user-123']),
    ).toEqual(mockStatus);
    expect(
      queryClient.getQueryData(['dailyReports', 'today', 'other-user-456']),
    ).toBeUndefined();

    queryClient.clear();
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });
});
