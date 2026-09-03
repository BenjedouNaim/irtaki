import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as performanceApi from '@/shared/api/performance.client';
import { ApiError } from '@/shared/api/types';
import {
  useMyPerformance,
  MY_PERFORMANCE_QUERY_KEY,
  myPerformanceQueryKey,
} from '../useMyPerformance';
import { useAuthStore } from '@/shared/auth';

jest.mock('@/shared/api/performance.client');

const mockPerformance: performanceApi.PerformanceDto = {
  commitment_score: 77.5,
  submission_rate: 80,
  memorization_rate: 50,
  revision_rate: 80,
  attendance_rate: 100,
  repetition_quality: 50,
  day_breakdown: {
    normal: 3,
    revision: 1,
    absent_excused: 1,
    absent_other: 0,
    no_report: 1,
  },
  days_since_last_report: 1,
};

function renderUseMyPerformance(period?: performanceApi.PerformancePeriod) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => (period ? useMyPerformance(period) : useMyPerformance()),
    { wrapper },
  );
  return { ...hook, queryClient };
}

describe('useMyPerformance (F-PERF-01 / API-037)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable key root ["performance","mine"] for invalidation (TS §26)', () => {
    expect(MY_PERFORMANCE_QUERY_KEY).toEqual(['performance', 'mine']);
  });

  it('defaults to the week period and calls getMyPerformance with it', async () => {
    jest
      .spyOn(performanceApi, 'getMyPerformance')
      .mockResolvedValue(mockPerformance);

    const { result, queryClient } = renderUseMyPerformance();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(performanceApi.getMyPerformance).toHaveBeenCalledWith({
      period: 'week',
    });
    expect(result.current.data).toEqual(mockPerformance);
    expect(
      queryClient.getQueryData(['performance', 'mine', 'anonymous', 'week']),
    ).toEqual(mockPerformance);

    queryClient.clear();
  });

  it('caches each period separately — every metric is recomputed per period (FR-PERF-07)', async () => {
    jest
      .spyOn(performanceApi, 'getMyPerformance')
      .mockResolvedValue(mockPerformance);

    const { result, queryClient } = renderUseMyPerformance('3months');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(performanceApi.getMyPerformance).toHaveBeenCalledWith({
      period: '3months',
    });
    expect(
      queryClient.getQueryData(['performance', 'mine', 'anonymous', '3months']),
    ).toEqual(mockPerformance);
    expect(
      queryClient.getQueryData(['performance', 'mine', 'anonymous', 'week']),
    ).toBeUndefined();

    queryClient.clear();
  });

  it('scopes the key to the authenticated user, preventing cross-account leaks', async () => {
    jest
      .spyOn(performanceApi, 'getMyPerformance')
      .mockResolvedValue(mockPerformance);
    act(() => {
      useAuthStore.setState({ userId: 'student-user-123' });
    });

    const { result, queryClient } = renderUseMyPerformance();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(myPerformanceQueryKey('student-user-123', 'week')).toEqual([
      'performance',
      'mine',
      'student-user-123',
      'week',
    ]);
    expect(
      queryClient.getQueryData([
        'performance',
        'mine',
        'student-user-123',
        'week',
      ]),
    ).toEqual(mockPerformance);
    expect(
      queryClient.getQueryData([
        'performance',
        'mine',
        'other-user-456',
        'week',
      ]),
    ).toBeUndefined();

    queryClient.clear();
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });

  it('surfaces the client error unchanged so the section can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest.spyOn(performanceApi, 'getMyPerformance').mockRejectedValue(error);

    const { result, queryClient } = renderUseMyPerformance();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('refetch() calls getMyPerformance again', async () => {
    jest
      .spyOn(performanceApi, 'getMyPerformance')
      .mockResolvedValue(mockPerformance);

    const { result, queryClient } = renderUseMyPerformance();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();

    expect(performanceApi.getMyPerformance).toHaveBeenCalledTimes(2);

    queryClient.clear();
  });
});
