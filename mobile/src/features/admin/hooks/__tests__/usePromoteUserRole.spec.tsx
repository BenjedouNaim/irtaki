import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as usersApi from '@/shared/api/users.client';
import { ApiError } from '@/shared/api/types';
import {
  usePromoteUserRole,
  USERS_QUERY_KEY,
  PROMOTE_USER_ROLE_INVALIDATES,
} from '../usePromoteUserRole';

jest.mock('@/shared/api/users.client');

const promoted: usersApi.UserListItem = {
  id: 'user-1',
  email: 'mounir@example.com',
  full_name: 'منير الغربي',
  role: 'Assistant',
};

function renderPromote() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => usePromoteUserRole(), { wrapper });
  return { ...hook, queryClient };
}

describe('usePromoteUserRole (F-ADM-01 / API-052)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declares the TS §26 invalidation keys once: the user directory only', () => {
    expect(USERS_QUERY_KEY).toEqual(['users']);
    expect(PROMOTE_USER_ROLE_INVALIDATES).toEqual([['users']]);
  });

  it('promotes through the client and resolves the updated user', async () => {
    jest
      .spyOn(usersApi, 'promoteUserRole')
      .mockResolvedValue({ data: promoted });
    const { result } = renderPromote();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({
        userId: 'user-1',
        role: 'Assistant',
      });
    });

    expect(usersApi.promoteUserRole).toHaveBeenCalledWith(
      'user-1',
      'Assistant',
    );
    expect(outcome).toEqual(promoted);
  });

  it('invalidates the user directory after a successful promotion', async () => {
    jest
      .spyOn(usersApi, 'promoteUserRole')
      .mockResolvedValue({ data: { ...promoted, role: 'Teacher' } });
    const { result, queryClient } = renderPromote();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({ userId: 'user-1', role: 'Teacher' });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] });
  });

  it('surfaces a 422 SOURCE_ROLE_NOT_USER unchanged for the caller to map', async () => {
    const apiError = new ApiError({
      statusCode: 422,
      error: 'SOURCE_ROLE_NOT_USER',
      message: 'لا يمكن ترقية هذا الحساب لأن دوره الحالي ليس "مستخدم"',
      correlationId: 'corr-1',
    });
    jest.spyOn(usersApi, 'promoteUserRole').mockRejectedValue(apiError);
    const { result } = renderPromote();

    await act(async () => {
      await expect(
        result.current.mutateAsync({ userId: 'user-1', role: 'Teacher' }),
      ).rejects.toBe(apiError);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
