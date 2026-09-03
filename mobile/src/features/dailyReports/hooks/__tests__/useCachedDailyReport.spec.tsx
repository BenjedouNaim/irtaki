import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { apiClient } from '@/shared/api/client';
import { useAuthStore } from '@/shared/auth';
import { useCachedDailyReport } from '../useCachedDailyReport';
import { ownDailyReportsQueryKey } from '../useOwnDailyReports';
import { todayReportStatusQueryKey } from '../useTodayReportStatus';

jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
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

const r1 = report('r1', '2026-08-01');
const r2 = report('r2', '2026-08-02');
const todayReport = report('today', '2026-09-02');

function seed(userId: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  queryClient.setQueryData(ownDailyReportsQueryKey(userId), {
    pageParams: [undefined, 'cursor-2'],
    pages: [
      {
        data: [r2],
        pagination: { next_cursor: 'cursor-2', has_more: true },
      },
      { data: [r1], pagination: { next_cursor: null, has_more: false } },
    ],
  });
  queryClient.setQueryData(todayReportStatusQueryKey(userId), {
    can_submit: false,
    block_reason: 'already_submitted',
    existing_report: todayReport,
  });
  return queryClient;
}

function renderLookup(queryClient: QueryClient, id: string | undefined) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCachedDailyReport(id), { wrapper });
}

describe('useCachedDailyReport (F-DR-07: detail from already-fetched data)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });

  it('finds a row on any page of the own-history cache', () => {
    const queryClient = seed(null);

    expect(renderLookup(queryClient, 'r2').result.current).toEqual(r2);
    expect(renderLookup(queryClient, 'r1').result.current).toEqual(r1);
    queryClient.clear();
  });

  it("finds today's report in the API-029 cache (Home → View Today's Report)", () => {
    const queryClient = seed(null);

    expect(renderLookup(queryClient, 'today').result.current).toEqual(
      todayReport,
    );
    queryClient.clear();
  });

  it('returns null for an unknown or missing id without fetching anything', () => {
    const queryClient = seed(null);

    expect(renderLookup(queryClient, 'nope').result.current).toBeNull();
    expect(renderLookup(queryClient, undefined).result.current).toBeNull();
    queryClient.clear();
  });

  it('never issues a request — it is a pure cache read', () => {
    const queryClient = seed(null);

    renderLookup(queryClient, 'r1');
    renderLookup(queryClient, 'today');
    renderLookup(queryClient, 'nope');

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(dailyReportsApi.listOwnDailyReports).not.toHaveBeenCalled();
    expect(dailyReportsApi.getTodayReportStatus).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('reads the caches of the authenticated user only (no cross-account leak)', () => {
    act(() => {
      useAuthStore.setState({ userId: 'student-user-123' });
    });
    const otherUsersCache = seed('other-user-456');
    expect(renderLookup(otherUsersCache, 'r1').result.current).toBeNull();
    otherUsersCache.clear();

    const ownCache = seed('student-user-123');
    expect(renderLookup(ownCache, 'r1').result.current).toEqual(r1);
    ownCache.clear();
  });
});
