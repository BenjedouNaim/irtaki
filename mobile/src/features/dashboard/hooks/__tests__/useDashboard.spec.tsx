import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as dashboardApi from '@/shared/api/dashboard.client';
import { useAuthStore } from '@/shared/auth';
import {
  DASHBOARD_QUERY_KEY,
  dashboardQueryKey,
  useDashboard,
} from '../useDashboard';

jest.mock('@/shared/api/dashboard.client');

const adminPayload: dashboardApi.AdminDashboardDto = {
  group_count: 4,
  staff_count: 5,
  student_count: 32,
  pending_recovery_count: 6,
};

let queryClient: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useDashboard (F-DASH-01 / API-009)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    useAuthStore.getState().clearSession();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('keeps a stable root key so a mutation can invalidate it (TS §26)', () => {
    expect(DASHBOARD_QUERY_KEY).toEqual(['me', 'dashboard']);
  });

  it('scopes the key to the account, never leaking across sessions', () => {
    expect(dashboardQueryKey('user-1')).toEqual(['me', 'dashboard', 'user-1']);
    expect(dashboardQueryKey(null)).toEqual(['me', 'dashboard', 'anonymous']);
    expect(dashboardQueryKey('user-1')).not.toEqual(
      dashboardQueryKey('user-2'),
    );
  });

  it('resolves the caller-typed arm of the union', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue(adminPayload);

    const { result } = renderHook(
      () => useDashboard<dashboardApi.AdminDashboardDto>(),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(adminPayload);
    expect(dashboardApi.getMyDashboard).toHaveBeenCalledTimes(1);
  });

  it('surfaces the error untouched for the screen to map (UF §24)', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useDashboard(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });

  it('caches per account — a second session does not read the first one', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue(adminPayload);

    useAuthStore.setState({ userId: 'user-1' });
    const first = renderHook(() => useDashboard(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    useAuthStore.setState({ userId: 'user-2' });
    const second = renderHook(() => useDashboard(), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(dashboardApi.getMyDashboard).toHaveBeenCalledTimes(2);
  });
});
