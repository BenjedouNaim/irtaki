import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { ApiError } from '@/shared/api/types';
import {
  useMembershipDailyReports,
  MEMBERSHIP_DAILY_REPORTS_QUERY_KEY,
  membershipDailyReportsQueryKey,
} from '../useMembershipDailyReports';
import { OWN_DAILY_REPORTS_QUERY_KEY } from '../useOwnDailyReports';
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

const page1: dailyReportsApi.DailyReportListResponse = {
  data: [report('r3', '2026-08-03'), report('r2', '2026-08-02')],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const page2: dailyReportsApi.DailyReportListResponse = {
  data: [report('r1', '2026-08-01')],
  pagination: { next_cursor: null, has_more: false },
};

const MEMBERSHIP_ID = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';

function renderUseMembershipDailyReports(membershipId = MEMBERSHIP_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useMembershipDailyReports(membershipId), {
    wrapper,
  });
  return { ...hook, queryClient };
}

describe('useMembershipDailyReports (F-DR-06 / API-032)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });

  it('keys the cache by endpoint + membership + viewer, apart from the own-history key (TS §26)', () => {
    expect(MEMBERSHIP_DAILY_REPORTS_QUERY_KEY).toEqual([
      'daily-reports',
      'membership',
    ]);
    expect(membershipDailyReportsQueryKey(MEMBERSHIP_ID, 'teacher-1')).toEqual([
      'daily-reports',
      'membership',
      MEMBERSHIP_ID,
      'teacher-1',
    ]);
    expect(membershipDailyReportsQueryKey(MEMBERSHIP_ID, null)).toEqual([
      'daily-reports',
      'membership',
      MEMBERSHIP_ID,
      'anonymous',
    ]);
    expect(membershipDailyReportsQueryKey(MEMBERSHIP_ID)).not.toEqual(
      expect.arrayContaining(OWN_DAILY_REPORTS_QUERY_KEY.slice(1)),
    );
  });

  it('fetches the first page of API-032 with limit=20 and no cursor, never API-031, flattening rows in server order', async () => {
    jest
      .spyOn(dailyReportsApi, 'listMembershipDailyReports')
      .mockResolvedValue(page1);

    const { result, queryClient } = renderUseMembershipDailyReports();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(dailyReportsApi.listMembershipDailyReports).toHaveBeenCalledTimes(1);
    expect(dailyReportsApi.listMembershipDailyReports).toHaveBeenCalledWith(
      MEMBERSHIP_ID,
      { limit: 20 },
    );
    expect(dailyReportsApi.listOwnDailyReports).not.toHaveBeenCalled();
    expect(result.current.data?.map((r) => r.id)).toEqual(['r3', 'r2']);
    expect(result.current.hasNextPage).toBe(true);
    expect(
      queryClient.getQueryData(
        membershipDailyReportsQueryKey(MEMBERSHIP_ID, null),
      ),
    ).toBeTruthy();

    queryClient.clear();
  });

  it('fetches the next page with the server next_cursor and stops when has_more is false', async () => {
    jest
      .spyOn(dailyReportsApi, 'listMembershipDailyReports')
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const { result, queryClient } = renderUseMembershipDailyReports();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data?.map((r) => r.id)).toEqual(['r3', 'r2', 'r1']),
    );
    expect(dailyReportsApi.listMembershipDailyReports).toHaveBeenLastCalledWith(
      MEMBERSHIP_ID,
      {
        limit: 20,
        cursor: 'cursor-2',
      },
    );
    expect(result.current.hasNextPage).toBe(false);

    queryClient.clear();
  });

  it('surfaces the uniform 403 unchanged so the list can show the filter message (UF §24, TS §29)', async () => {
    const error = new ApiError({
      statusCode: 403,
      error: 'SCOPE_DENIED',
      message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
    });
    jest
      .spyOn(dailyReportsApi, 'listMembershipDailyReports')
      .mockRejectedValue(error);

    const { result, queryClient } = renderUseMembershipDailyReports();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('scopes the key to the authenticated viewer (no cross-account leak)', async () => {
    jest
      .spyOn(dailyReportsApi, 'listMembershipDailyReports')
      .mockResolvedValue(page2);
    act(() => {
      useAuthStore.setState({ userId: 'teacher-user-123' });
    });

    const { result, queryClient } = renderUseMembershipDailyReports();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData([
        'daily-reports',
        'membership',
        MEMBERSHIP_ID,
        'teacher-user-123',
      ]),
    ).toBeTruthy();
    expect(
      queryClient.getQueryData([
        'daily-reports',
        'membership',
        MEMBERSHIP_ID,
        'anonymous',
      ]),
    ).toBeUndefined();

    queryClient.clear();
  });
});
