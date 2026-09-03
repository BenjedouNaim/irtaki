import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCachedWeeklyReport } from '../useCachedWeeklyReport';
import { ownWeeklyReportsQueryKey } from '../useOwnWeeklyReports';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';
import { apiClient } from '@/shared/api/client';
import { useAuthStore } from '@/shared/auth';

jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

function report(id: string): WeeklyReportDto {
  return {
    id,
    week_start: '2026-08-15',
    week_end: '2026-08-21',
    expected_days: 6,
    missed_daily_reports: 1,
    missed_daily_memorization: 2,
    missed_daily_revision: 3,
    missed_50_repetitions: 4,
    missed_single_session: 5,
    attended_recitation_call: true,
    state: 'Finalised',
    finalised_at: '2026-08-21T09:00:00.000Z',
    finalised_by: 'Student',
  };
}

describe('useCachedWeeklyReport (read-only weekly detail source, F-WR-03)', () => {
  let queryClient: QueryClient;

  function renderUse(id: string | undefined) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useCachedWeeklyReport(id), { wrapper });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
    act(() => {
      useAuthStore.setState({ userId: 'student-1' });
    });
  });

  afterEach(() => {
    queryClient.clear();
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });

  it('finds the row across the cached own-history pages without any request', () => {
    queryClient.setQueryData(ownWeeklyReportsQueryKey('student-1'), {
      pages: [
        {
          data: [report('w3')],
          pagination: { next_cursor: 'c', has_more: true },
        },
        {
          data: [report('w1')],
          pagination: { next_cursor: null, has_more: false },
        },
      ],
      pageParams: [undefined, 'c'],
    });

    const { result } = renderUse('w1');

    expect(result.current).toEqual(report('w1'));
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('returns null for an unknown id, a missing id and another account cache', () => {
    queryClient.setQueryData(ownWeeklyReportsQueryKey('someone-else'), {
      pages: [
        {
          data: [report('w1')],
          pagination: { next_cursor: null, has_more: false },
        },
      ],
      pageParams: [undefined],
    });

    expect(renderUse('w1').result.current).toBeNull();
    expect(renderUse('nope').result.current).toBeNull();
    expect(renderUse(undefined).result.current).toBeNull();
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
