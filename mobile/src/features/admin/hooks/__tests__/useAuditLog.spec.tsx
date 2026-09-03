import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as auditApi from '@/shared/api/audit.client';
import { ApiError } from '@/shared/api/types';
import { useAuthStore } from '@/shared/auth';
import {
  AUDIT_PAGE_SIZE,
  AUDIT_QUERY_KEY,
  AuditActionFilter,
  auditLogQueryKey,
  useAuditLog,
} from '../useAuditLog';

jest.mock('@/shared/api/audit.client');

function entry(
  id: string,
  action: auditApi.AuditActionName,
): auditApi.AuditEntry {
  return {
    id,
    actor: { id: `actor-${id}`, full_name: `فاعل ${id}` },
    action,
    target_type: action === 'LOGIN' ? null : 'Group',
    target_id: action === 'LOGIN' ? null : 'g1',
    occurred_at: '2026-09-03T08:12:00.000Z',
  };
}

const page1: auditApi.AuditLogResponse = {
  data: [entry('a3', 'ENROLLMENT_TOGGLED'), entry('a2', 'LOGIN')],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const page2: auditApi.AuditLogResponse = {
  data: [entry('a1', 'GROUP_CREATED')],
  pagination: { next_cursor: null, has_more: false },
};

function renderAuditLog(action: AuditActionFilter = 'all') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useAuditLog(action), { wrapper });
  return { ...hook, queryClient };
}

describe('useAuditLog (F-ADM-03 / API-054)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keys by endpoint, filter and viewer (TS §26)', () => {
    expect(AUDIT_QUERY_KEY).toEqual(['audit']);
    expect(auditLogQueryKey('all', 'admin-1')).toEqual([
      'audit',
      'all',
      'admin-1',
    ]);
    expect(auditLogQueryKey('LOGIN')).toEqual(['audit', 'LOGIN', 'anonymous']);
  });

  it('fetches the first page with limit=20 and no action param, in server order', async () => {
    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue(page1);

    const { result, queryClient } = renderAuditLog('all');

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(AUDIT_PAGE_SIZE).toBe(20);
    expect(auditApi.listAuditEntries).toHaveBeenCalledWith({ limit: 20 });
    expect(result.current.data?.map((e) => e.id)).toEqual(['a3', 'a2']);
    expect(result.current.hasNextPage).toBe(true);

    queryClient.clear();
  });

  it.each([
    'LOGIN' as const,
    'GROUP_CREATED' as const,
    'ENROLLMENT_TOGGLED' as const,
  ])('sends %s as the APIS §9.3 action filter', async (action) => {
    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue(page2);

    const { result, queryClient } = renderAuditLog(action);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(auditApi.listAuditEntries).toHaveBeenCalledWith({
      action,
      limit: 20,
    });

    queryClient.clear();
  });

  it('never sends from/to — SCR-33 offers no date control', async () => {
    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue(page1);

    const { result, queryClient } = renderAuditLog('all');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = jest.mocked(auditApi.listAuditEntries).mock.calls[0][0];
    expect(params).not.toHaveProperty('from');
    expect(params).not.toHaveProperty('to');

    queryClient.clear();
  });

  it('follows next_cursor for the next page and stops when has_more is false', async () => {
    jest
      .spyOn(auditApi, 'listAuditEntries')
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const { result, queryClient } = renderAuditLog('all');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data?.map((e) => e.id)).toEqual(['a3', 'a2', 'a1']),
    );
    expect(auditApi.listAuditEntries).toHaveBeenLastCalledWith({
      limit: 20,
      cursor: 'cursor-2',
    });
    expect(result.current.hasNextPage).toBe(false);

    queryClient.clear();
  });

  it('caches each action filter separately so switching chips is a distinct read', async () => {
    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue(page2);
    act(() => {
      useAuthStore.setState({ userId: 'admin-1' });
    });

    const { result, queryClient } = renderAuditLog('LOGIN');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['audit', 'LOGIN', 'admin-1']),
    ).toBeTruthy();
    expect(
      queryClient.getQueryData(['audit', 'all', 'admin-1']),
    ).toBeUndefined();

    queryClient.clear();
    act(() => {
      useAuthStore.getState().clearSession();
    });
  });

  it('surfaces the client error unchanged so the list can map it (UF §24)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest.spyOn(auditApi, 'listAuditEntries').mockRejectedValue(error);

    const { result, queryClient } = renderAuditLog('all');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });
});
