import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as preferencesApi from '@/shared/api/notificationPreferences.client';
import { ApiError } from '@/shared/api/types';
import {
  useSetNotificationPreference,
  SET_NOTIFICATION_PREFERENCE_INVALIDATES,
} from '../useSetNotificationPreference';

jest.mock('@/shared/api/notificationPreferences.client');

const muted: preferencesApi.NotificationPreferenceDto = {
  category: 'N-01',
  description: 'Daily report not yet submitted',
  is_mutable: true,
  muted: true,
};

function renderSetPreference() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSetNotificationPreference(), { wrapper });
  return { ...hook, queryClient };
}

describe('useSetNotificationPreference (F-NOT-04 / API-051)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declares the TS §26 invalidation key once: the caller own catalogue', () => {
    expect(SET_NOTIFICATION_PREFERENCE_INVALIDATES).toEqual([
      ['notification-preferences', 'mine'],
    ]);
  });

  it('mutes through the client and invalidates the catalogue', async () => {
    jest
      .spyOn(preferencesApi, 'setNotificationPreference')
      .mockResolvedValue(muted);
    const { result, queryClient } = renderSetPreference();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({
        category: 'N-01',
        muted: true,
      });
    });

    // TanStack v5 hands the mutationFn a second (context) argument.
    expect(preferencesApi.setNotificationPreference).toHaveBeenCalledWith(
      { category: 'N-01', muted: true },
      expect.anything(),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['notification-preferences', 'mine'],
    });
    expect(outcome).toEqual(muted);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    queryClient.clear();
  });

  it('unmutes just as readily', async () => {
    jest
      .spyOn(preferencesApi, 'setNotificationPreference')
      .mockResolvedValue({ ...muted, muted: false });
    const { result, queryClient } = renderSetPreference();

    let outcome: preferencesApi.NotificationPreferenceDto | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({
        category: 'N-01',
        muted: false,
      });
    });

    expect(outcome?.muted).toBe(false);
    queryClient.clear();
  });

  // The screen renders no toggle for an account-critical row, so this is the
  // defensive path; VR-38 is the server's decision either way.
  it('surfaces a 422 ACCOUNT_CRITICAL_CATEGORY unchanged', async () => {
    const error = new ApiError({
      statusCode: 422,
      error: 'ACCOUNT_CRITICAL_CATEGORY',
      message: 'هذه الفئة حساسة للحساب ولا يمكن كتمها',
    });
    jest
      .spyOn(preferencesApi, 'setNotificationPreference')
      .mockRejectedValue(error);
    const { result, queryClient } = renderSetPreference();

    await act(async () => {
      await expect(
        result.current.mutateAsync({ category: 'N-03', muted: true }),
      ).rejects.toBe(error);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    queryClient.clear();
  });

  it('re-reads the catalogue after a FAILED write too, so the UI cannot drift', async () => {
    jest.spyOn(preferencesApi, 'setNotificationPreference').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'boom',
      }),
    );
    const { result, queryClient } = renderSetPreference();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current
        .mutateAsync({ category: 'N-01', muted: true })
        .catch(() => undefined);
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['notification-preferences', 'mine'],
    });
    queryClient.clear();
  });
});
