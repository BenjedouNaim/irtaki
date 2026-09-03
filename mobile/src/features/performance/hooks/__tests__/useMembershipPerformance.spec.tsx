import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as performanceApi from '@/shared/api/performance.client';
import { ApiError } from '@/shared/api/types';
import {
  useMembershipPerformance,
  MEMBERSHIP_PERFORMANCE_QUERY_KEY,
  membershipPerformanceQueryKey,
} from '../useMembershipPerformance';

jest.mock('@/shared/api/performance.client');

const MEMBERSHIP_ID = 'membership-1';

const mockPerformance: performanceApi.PerformanceDto = {
  commitment_score: 41,
  submission_rate: 60,
  memorization_rate: 33,
  revision_rate: 50,
  attendance_rate: null,
  repetition_quality: 60,
  day_breakdown: {
    normal: 14,
    revision: 5,
    absent_excused: 3,
    absent_other: 2,
    no_report: 4,
  },
  days_since_last_report: 5,
};

function renderUseMembershipPerformance(
  period?: performanceApi.PerformancePeriod,
  membershipId = MEMBERSHIP_ID,
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
        ? useMembershipPerformance(membershipId, period)
        : useMembershipPerformance(membershipId),
    { wrapper },
  );
  return { ...hook, queryClient };
}

describe('useMembershipPerformance (F-PERF-03 / API-039)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable key root ["performance","membership"] (TS §26)', () => {
    expect(MEMBERSHIP_PERFORMANCE_QUERY_KEY).toEqual([
      'performance',
      'membership',
    ]);
    expect(membershipPerformanceQueryKey(MEMBERSHIP_ID, 'month')).toEqual([
      'performance',
      'membership',
      MEMBERSHIP_ID,
      'month',
    ]);
  });

  it('defaults to the week period and calls getMembershipPerformance with it', async () => {
    jest
      .spyOn(performanceApi, 'getMembershipPerformance')
      .mockResolvedValue(mockPerformance);

    const { result, queryClient } = renderUseMembershipPerformance();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(performanceApi.getMembershipPerformance).toHaveBeenCalledWith(
      MEMBERSHIP_ID,
      { period: 'week' },
    );
    expect(result.current.data).toEqual(mockPerformance);

    queryClient.clear();
  });

  it('caches each period separately — every figure is recomputed per period (FR-PERF-07)', async () => {
    jest
      .spyOn(performanceApi, 'getMembershipPerformance')
      .mockResolvedValue(mockPerformance);

    const { result, queryClient } = renderUseMembershipPerformance('3months');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData([
        'performance',
        'membership',
        MEMBERSHIP_ID,
        '3months',
      ]),
    ).toEqual(mockPerformance);
    expect(
      queryClient.getQueryData([
        'performance',
        'membership',
        MEMBERSHIP_ID,
        'week',
      ]),
    ).toBeUndefined();

    queryClient.clear();
  });

  it('keeps two students in separate cache entries', async () => {
    jest
      .spyOn(performanceApi, 'getMembershipPerformance')
      .mockResolvedValue(mockPerformance);

    const { result, queryClient } = renderUseMembershipPerformance(
      'week',
      'membership-2',
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData([
        'performance',
        'membership',
        'membership-2',
        'week',
      ]),
    ).toEqual(mockPerformance);
    expect(
      queryClient.getQueryData([
        'performance',
        'membership',
        MEMBERSHIP_ID,
        'week',
      ]),
    ).toBeUndefined();

    queryClient.clear();
  });

  it('does not fetch without a membership id', async () => {
    jest
      .spyOn(performanceApi, 'getMembershipPerformance')
      .mockResolvedValue(mockPerformance);

    const { result, queryClient } = renderUseMembershipPerformance('week', '');

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(performanceApi.getMembershipPerformance).not.toHaveBeenCalled();

    queryClient.clear();
  });

  it('surfaces the client error unchanged so the section can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 403,
      error: 'SCOPE_DENIED',
      message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
    });
    jest
      .spyOn(performanceApi, 'getMembershipPerformance')
      .mockRejectedValue(error);

    const { result, queryClient } = renderUseMembershipPerformance();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });
});
