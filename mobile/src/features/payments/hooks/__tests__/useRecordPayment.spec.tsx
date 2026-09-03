import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as paymentsApi from '@/shared/api/payments.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { GROUP_PAYMENTS_QUERY_KEY } from '../useGroupPayments';
import { MY_PAYMENTS_QUERY_KEY } from '../useMyPayments';
import {
  RECORD_PAYMENT_INVALIDATES,
  useRecordPayment,
} from '../useRecordPayment';

jest.mock('@/shared/api/payments.client');

const record: paymentsApi.PaymentRecordDto = {
  id: 'p-1',
  cycle_index: 2,
  amount: 30,
  paid_at: '2026-09-03T09:00:00.000Z',
  recorded_by: 'assistant-1',
};

function renderUseRecordPayment() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useRecordPayment(), { wrapper });
  return { ...hook, queryClient };
}

describe('useRecordPayment (F-PAY-03 / API-047)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (paymentsApi.recordPayment as jest.Mock).mockResolvedValue(record);
  });

  it('sends cycle_index alone — BR-31 fixes the fee server-side, no amount is ever sent', async () => {
    const { result } = renderUseRecordPayment();

    result.current.mutate({ membershipId: 'm-1', cycleIndex: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paymentsApi.recordPayment).toHaveBeenCalledWith('m-1', {
      cycle_index: 2,
    });
    const payload = (paymentsApi.recordPayment as jest.Mock).mock
      .calls[0][1] as Record<string, unknown> | undefined;
    expect(Object.keys(payload ?? {})).toEqual(['cycle_index']);
  });

  it('resolves with the persisted record on 201', async () => {
    const { result } = renderUseRecordPayment();

    result.current.mutate({ membershipId: 'm-1', cycleIndex: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ kind: 'recorded', record });
    expect(result.current.data).toMatchObject({ record: { amount: 30 } });
  });

  it('treats 409 CYCLE_ALREADY_PAID as success, not an error (UF §18 — no error tone)', async () => {
    (paymentsApi.recordPayment as jest.Mock).mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'CYCLE_ALREADY_PAID',
        message: 'تم تسجيل دفع هذه الدورة مسبقاً',
      }),
    );
    const { result } = renderUseRecordPayment();

    result.current.mutate({ membershipId: 'm-1', cycleIndex: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ kind: 'already_paid' });
  });

  it.each([
    [
      '422 FUTURE_CYCLE',
      new ApiError({
        statusCode: 422,
        error: 'FUTURE_CYCLE',
        message: 'لم تبدأ هذه الدورة بعد',
      }),
    ],
    [
      '403 SCOPE_DENIED',
      new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية',
      }),
    ],
    [
      'a 409 with another code',
      new ApiError({ statusCode: 409, error: 'CONFLICT', message: 'تعارض' }),
    ],
    ['a network failure', new NetworkError('offline')],
  ])('surfaces %s to the screen unchanged', async (_label, error) => {
    (paymentsApi.recordPayment as jest.Mock).mockRejectedValue(error);
    const { result } = renderUseRecordPayment();

    result.current.mutate({ membershipId: 'm-1', cycleIndex: 9 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  it('declares the keys a recording invalidates once (TS §26)', () => {
    expect(RECORD_PAYMENT_INVALIDATES).toEqual([
      GROUP_PAYMENTS_QUERY_KEY,
      MY_PAYMENTS_QUERY_KEY,
    ]);
  });

  it('invalidates every group ledger slice and the Student’s own ledger on success', async () => {
    const { result, queryClient } = renderUseRecordPayment();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    result.current.mutate({ membershipId: 'm-1', cycleIndex: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['payments', 'group'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['payments', 'mine'] });
  });

  it('invalidates on the 409 path too — the row must refresh to show it Paid', async () => {
    (paymentsApi.recordPayment as jest.Mock).mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'CYCLE_ALREADY_PAID',
        message: 'مسجَّلة',
      }),
    );
    const { result, queryClient } = renderUseRecordPayment();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    result.current.mutate({ membershipId: 'm-1', cycleIndex: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['payments', 'group'],
    });
  });

  it('exposes no reversal mutation — no endpoint exists to undo a payment (ISS-02)', () => {
    expect(paymentsApi).not.toHaveProperty('reversePayment');
    expect(paymentsApi).not.toHaveProperty('deletePayment');
  });
});
