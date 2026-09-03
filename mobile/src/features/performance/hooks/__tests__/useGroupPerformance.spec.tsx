import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as performanceApi from '@/shared/api/performance.client';
import { ApiError } from '@/shared/api/types';
import {
  useGroupPerformance,
  GROUP_PERFORMANCE_QUERY_KEY,
  groupPerformanceQueryKey,
} from '../useGroupPerformance';

jest.mock('@/shared/api/performance.client');

const GROUP_ID = 'group-1';

const mockGroupPerformance: performanceApi.GroupPerformanceDto = {
  commitment_average: 62,
  students: [
    { membership_id: 'm-1', full_name: 'يوسف بن سالم', commitment_score: 41 },
    { membership_id: 'm-2', full_name: 'مريم الجبالي', commitment_score: 83 },
  ],
  absence_breakdown: { sick: 2, studying: 1, other: 3 },
  submission_rate: 75,
};

function renderUseGroupPerformance(
  period?: performanceApi.PerformancePeriod,
  groupId = GROUP_ID,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      period
        ? useGroupPerformance(groupId, period)
        : useGroupPerformance(groupId),
    { wrapper },
  );
  return { ...hook, queryClient };
}

describe('useGroupPerformance (F-PERF-02 / API-038)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable key root ["performance","group"] for invalidation (TS §26)', () => {
    expect(GROUP_PERFORMANCE_QUERY_KEY).toEqual(['performance', 'group']);
    expect(groupPerformanceQueryKey(GROUP_ID, 'month')).toEqual([
      'performance',
      'group',
      GROUP_ID,
      'month',
    ]);
  });

  it('defaults to the week period and calls getGroupPerformance with it', async () => {
    jest
      .spyOn(performanceApi, 'getGroupPerformance')
      .mockResolvedValue(mockGroupPerformance);

    const { result, queryClient } = renderUseGroupPerformance();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(performanceApi.getGroupPerformance).toHaveBeenCalledWith(GROUP_ID, {
      period: 'week',
    });
    expect(result.current.data).toEqual(mockGroupPerformance);

    queryClient.clear();
  });

  it('caches each period separately — the member set itself differs (FR-PERF-09/10)', async () => {
    jest
      .spyOn(performanceApi, 'getGroupPerformance')
      .mockResolvedValue(mockGroupPerformance);

    const { result, queryClient } = renderUseGroupPerformance('month');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['performance', 'group', GROUP_ID, 'month']),
    ).toEqual(mockGroupPerformance);
    expect(
      queryClient.getQueryData(['performance', 'group', GROUP_ID, 'week']),
    ).toBeUndefined();

    queryClient.clear();
  });

  it('keeps two groups in separate cache entries', async () => {
    jest
      .spyOn(performanceApi, 'getGroupPerformance')
      .mockResolvedValue(mockGroupPerformance);

    const { result, queryClient } = renderUseGroupPerformance(
      'week',
      'group-2',
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['performance', 'group', 'group-2', 'week']),
    ).toEqual(mockGroupPerformance);
    expect(
      queryClient.getQueryData(['performance', 'group', GROUP_ID, 'week']),
    ).toBeUndefined();

    queryClient.clear();
  });

  it('does not fetch without a group id', async () => {
    jest
      .spyOn(performanceApi, 'getGroupPerformance')
      .mockResolvedValue(mockGroupPerformance);

    const { result, queryClient } = renderUseGroupPerformance('week', '');

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(performanceApi.getGroupPerformance).not.toHaveBeenCalled();

    queryClient.clear();
  });

  it('surfaces the client error unchanged so the section can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest.spyOn(performanceApi, 'getGroupPerformance').mockRejectedValue(error);

    const { result, queryClient } = renderUseGroupPerformance();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('refetch() calls getGroupPerformance again', async () => {
    jest
      .spyOn(performanceApi, 'getGroupPerformance')
      .mockResolvedValue(mockGroupPerformance);

    const { result, queryClient } = renderUseGroupPerformance();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();

    expect(performanceApi.getGroupPerformance).toHaveBeenCalledTimes(2);

    queryClient.clear();
  });
});
