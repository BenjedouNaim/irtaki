import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as preferencesApi from '@/shared/api/notificationPreferences.client';
import { ApiError } from '@/shared/api/types';
import { useAuthStore } from '@/shared/auth';
import {
  useNotificationPreferences,
  NOTIFICATION_PREFERENCES_QUERY_KEY,
} from '../useNotificationPreferences';

jest.mock('@/shared/api/notificationPreferences.client');

const catalogue: preferencesApi.NotificationPreferenceDto[] = [
  {
    category: 'N-01',
    description: 'Daily report not yet submitted',
    is_mutable: true,
    muted: false,
  },
  {
    category: 'N-08',
    description: 'Removed from group',
    is_mutable: false,
    muted: false,
  },
];

function renderPreferences() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useNotificationPreferences(), { wrapper });
  return { ...hook, queryClient };
}

describe('useNotificationPreferences (F-NOT-03 / API-050)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useAuthStore.setState({ userId: null });
    });
  });

  it('exposes the stable TS §26 key ["notification-preferences","mine"]', () => {
    expect(NOTIFICATION_PREFERENCES_QUERY_KEY).toEqual([
      'notification-preferences',
      'mine',
    ]);
  });

  it('wires getNotificationPreferences as the queryFn and resolves the catalogue', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);

    const { result, queryClient } = renderPreferences();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(preferencesApi.getNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(catalogue);
    queryClient.clear();
  });

  it('scopes the key to the signed-in user (no cross-account cache leak)', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);
    act(() => {
      useAuthStore.setState({ userId: 'user-123' });
    });

    const { result, queryClient } = renderPreferences();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData([
        'notification-preferences',
        'mine',
        'user-123',
      ]),
    ).toEqual(catalogue);
    queryClient.clear();
  });

  it('surfaces the client error unchanged so the screen can map it (UF §24)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockRejectedValue(error);

    const { result, queryClient } = renderPreferences();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    queryClient.clear();
  });

  it('refetch() asks the API again', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);

    const { result, queryClient } = renderPreferences();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await result.current.refetch();
    });

    expect(preferencesApi.getNotificationPreferences).toHaveBeenCalledTimes(2);
    queryClient.clear();
  });
});
