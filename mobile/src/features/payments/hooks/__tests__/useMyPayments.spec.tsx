import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as paymentsApi from '@/shared/api/payments.client';
import { ApiError } from '@/shared/api/types';
import { useAuthStore } from '@/shared/auth';
import { useMyPayments, MY_PAYMENTS_QUERY_KEY } from '../useMyPayments';

jest.mock('@/shared/api/payments.client');

const mockLedger: paymentsApi.PaymentLedgerDto = {
  cycles: [
    {
      index: 0,
      start_date: '2026-01-15',
      end_date: '2026-04-14',
      status: 'Paid',
      paid_at: '2026-02-03T09:30:00.000Z',
    },
    {
      index: 1,
      start_date: '2026-04-15',
      end_date: '2026-07-14',
      status: 'Due Soon',
    },
  ],
  next_due_date: '2026-07-14',
  arrears_count: 0,
};

function renderUseMyPayments() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useMyPayments(), { wrapper });
  return { ...hook, queryClient };
}

describe('useMyPayments (F-PAY-01 / API-045)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable query key ["payments","mine"] for invalidation (TS §26)', () => {
    expect(MY_PAYMENTS_QUERY_KEY).toEqual(['payments', 'mine']);
  });

  it('wires getMyPayments as the queryFn under that key and resolves the DTO', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue(mockLedger);

    const { result, queryClient } = renderUseMyPayments();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(paymentsApi.getMyPayments).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockLedger);
    expect(queryClient.getQueryData(['payments', 'mine', 'anonymous'])).toEqual(
      mockLedger,
    );

    queryClient.clear();
  });

  it('surfaces the client error unchanged so the screen can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest.spyOn(paymentsApi, 'getMyPayments').mockRejectedValue(error);

    const { result, queryClient } = renderUseMyPayments();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('refetch() calls getMyPayments again', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue(mockLedger);

    const { result, queryClient } = renderUseMyPayments();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();

    expect(paymentsApi.getMyPayments).toHaveBeenCalledTimes(2);

    queryClient.clear();
  });

  it('scopes the query key to the authenticated user identity', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue(mockLedger);
    act(() => {
      useAuthStore.setState({ userId: 'student-user-123' });
    });

    const { result, queryClient } = renderUseMyPayments();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['payments', 'mine', 'student-user-123']),
    ).toEqual(mockLedger);
    expect(
      queryClient.getQueryData(['payments', 'mine', 'other-user-456']),
    ).toBeUndefined();

    queryClient.clear();
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });
});
