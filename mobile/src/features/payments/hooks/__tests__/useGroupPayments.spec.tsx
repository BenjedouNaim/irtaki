import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as paymentsApi from '@/shared/api/payments.client';
import { ApiError } from '@/shared/api/types';
import {
  useGroupPayments,
  GroupPaymentsFilter,
  GROUP_PAYMENTS_QUERY_KEY,
  groupPaymentsQueryKey,
} from '../useGroupPayments';

jest.mock('@/shared/api/payments.client');

const ledgers: paymentsApi.GroupStudentLedgerDto[] = [
  {
    membership_id: 'membership-1',
    full_name: 'أحمد الطرابلسي',
    cycles: [
      {
        index: 0,
        start_date: '2026-01-15',
        end_date: '2026-04-14',
        status: 'Due Soon',
      },
    ],
    next_due_date: '2026-04-14',
    arrears_count: 0,
  },
];

function renderUseGroupPayments(
  groupId: string | null,
  status: GroupPaymentsFilter,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useGroupPayments(groupId, status), { wrapper });
  return { ...hook, queryClient };
}

describe('useGroupPayments (F-PAY-02 / API-046)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable ["payments","group"] key root for F-PAY-03 invalidation (TS §26)', () => {
    expect(GROUP_PAYMENTS_QUERY_KEY).toEqual(['payments', 'group']);
    expect(groupPaymentsQueryKey('g-1', undefined)).toEqual([
      'payments',
      'group',
      'g-1',
      'all',
    ]);
    expect(groupPaymentsQueryKey('g-1', 'Due Soon')).toEqual([
      'payments',
      'group',
      'g-1',
      'Due Soon',
    ]);
  });

  it('calls getGroupPayments with the selected group and no status for the "All" chip', async () => {
    jest.spyOn(paymentsApi, 'getGroupPayments').mockResolvedValue(ledgers);

    const { result, queryClient } = renderUseGroupPayments('g-1', undefined);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paymentsApi.getGroupPayments).toHaveBeenCalledWith('g-1', {
      status: undefined,
    });
    expect(result.current.data).toEqual(ledgers);
    expect(
      queryClient.getQueryData(['payments', 'group', 'g-1', 'all']),
    ).toEqual(ledgers);

    queryClient.clear();
  });

  it('sends the status to the server rather than filtering on the client (FR-PAY-06)', async () => {
    jest.spyOn(paymentsApi, 'getGroupPayments').mockResolvedValue(ledgers);

    const { result, queryClient } = renderUseGroupPayments('g-1', 'Unpaid');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paymentsApi.getGroupPayments).toHaveBeenCalledWith('g-1', {
      status: 'Unpaid',
    });

    queryClient.clear();
  });

  it('caches each status slice under its own key, so switching a chip refetches once', async () => {
    jest.spyOn(paymentsApi, 'getGroupPayments').mockResolvedValue(ledgers);

    const first = renderUseGroupPayments('g-1', undefined);
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderUseGroupPayments('g-1', 'Paid');
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(paymentsApi.getGroupPayments).toHaveBeenCalledTimes(2);

    first.queryClient.clear();
    second.queryClient.clear();
  });

  it('stays idle while no group is selected — an Assistant may have none assigned', async () => {
    jest.spyOn(paymentsApi, 'getGroupPayments').mockResolvedValue(ledgers);

    const { result, queryClient } = renderUseGroupPayments(null, undefined);

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(paymentsApi.getGroupPayments).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('surfaces the client error unchanged so the screen can map it (UF §24)', async () => {
    const error = new ApiError({
      statusCode: 403,
      error: 'SCOPE_DENIED',
      message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
    });
    jest.spyOn(paymentsApi, 'getGroupPayments').mockRejectedValue(error);

    const { result, queryClient } = renderUseGroupPayments('g-1', undefined);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);

    queryClient.clear();
  });
});
