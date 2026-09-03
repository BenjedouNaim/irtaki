import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as performanceApi from '@/shared/api/performance.client';
import { ApiError } from '@/shared/api/types';
import {
  useGroupAtRisk,
  GROUP_AT_RISK_QUERY_KEY,
  groupAtRiskQueryKey,
} from '../useGroupAtRisk';

jest.mock('@/shared/api/performance.client');

const GROUP_ID = 'group-1';

const mockAtRisk: performanceApi.AtRiskEntryDto[] = [
  {
    membership_id: 'm-1',
    full_name: 'يوسف بن سالم',
    days_since_last_report: 5,
  },
  {
    membership_id: 'm-2',
    full_name: 'مريم الجبالي',
    days_since_last_report: 3,
  },
];

function renderUseGroupAtRisk(groupId = GROUP_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useGroupAtRisk(groupId), { wrapper });
  return { ...hook, queryClient };
}

describe('useGroupAtRisk (F-PERF-04 / API-040)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable key root ["performance","at-risk"] (TS §26)', () => {
    expect(GROUP_AT_RISK_QUERY_KEY).toEqual(['performance', 'at-risk']);
    expect(groupAtRiskQueryKey(GROUP_ID)).toEqual([
      'performance',
      'at-risk',
      GROUP_ID,
    ]);
  });

  it('calls getGroupAtRisk with the group id alone — no period (SAS §18.4)', async () => {
    jest.spyOn(performanceApi, 'getGroupAtRisk').mockResolvedValue(mockAtRisk);

    const { result, queryClient } = renderUseGroupAtRisk();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(performanceApi.getGroupAtRisk).toHaveBeenCalledWith(GROUP_ID);
    expect(result.current.data).toEqual(mockAtRisk);

    queryClient.clear();
  });

  it('keeps two groups in separate cache entries', async () => {
    jest.spyOn(performanceApi, 'getGroupAtRisk').mockResolvedValue(mockAtRisk);

    const { result, queryClient } = renderUseGroupAtRisk('group-2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['performance', 'at-risk', 'group-2']),
    ).toEqual(mockAtRisk);
    expect(
      queryClient.getQueryData(['performance', 'at-risk', GROUP_ID]),
    ).toBeUndefined();

    queryClient.clear();
  });

  it('does not fetch without a group id', async () => {
    jest.spyOn(performanceApi, 'getGroupAtRisk').mockResolvedValue(mockAtRisk);

    const { result, queryClient } = renderUseGroupAtRisk('');

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(performanceApi.getGroupAtRisk).not.toHaveBeenCalled();

    queryClient.clear();
  });

  it('surfaces the client error unchanged so the section can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest.spyOn(performanceApi, 'getGroupAtRisk').mockRejectedValue(error);

    const { result, queryClient } = renderUseGroupAtRisk();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('refetch() calls getGroupAtRisk again', async () => {
    jest.spyOn(performanceApi, 'getGroupAtRisk').mockResolvedValue(mockAtRisk);

    const { result, queryClient } = renderUseGroupAtRisk();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();

    expect(performanceApi.getGroupAtRisk).toHaveBeenCalledTimes(2);

    queryClient.clear();
  });
});
