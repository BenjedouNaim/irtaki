import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as usersApi from '@/shared/api/users.client';
import { ApiError } from '@/shared/api/types';
import { useAuthStore } from '@/shared/auth';
import {
  useUsersDirectory,
  usersDirectoryQueryKey,
  UserRoleFilter,
  USERS_PAGE_SIZE,
} from '../useUsersDirectory';
import {
  PROMOTE_USER_ROLE_INVALIDATES,
  USERS_QUERY_KEY,
} from '../usePromoteUserRole';

jest.mock('@/shared/api/users.client');

function user(id: string, role: string): usersApi.UserListItem {
  return {
    id,
    email: `${id}@example.com`,
    full_name: `مستخدم ${id}`,
    role,
  };
}

const page1: usersApi.ListUsersResponse = {
  data: [user('u3', 'Teacher'), user('u2', 'User')],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const page2: usersApi.ListUsersResponse = {
  data: [user('u1', 'Student')],
  pagination: { next_cursor: null, has_more: false },
};

function renderDirectory(role: UserRoleFilter = 'all') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useUsersDirectory(role), { wrapper });
  return { ...hook, queryClient };
}

describe('useUsersDirectory (F-ADM-02 / API-053)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hangs off the ["users"] root a promotion invalidates (TS §26)', () => {
    expect(USERS_QUERY_KEY).toEqual(['users']);
    expect(PROMOTE_USER_ROLE_INVALIDATES).toContainEqual(USERS_QUERY_KEY);
    expect(usersDirectoryQueryKey('all', 'admin-1')).toEqual([
      'users',
      'all',
      'admin-1',
    ]);
    expect(usersDirectoryQueryKey('Teacher')).toEqual([
      'users',
      'Teacher',
      'anonymous',
    ]);
  });

  it('fetches the first page with limit=20 and no role param, flattening rows in server order', async () => {
    jest.spyOn(usersApi, 'listUsers').mockResolvedValue(page1);

    const { result, queryClient } = renderDirectory('all');

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(USERS_PAGE_SIZE).toBe(20);
    expect(usersApi.listUsers).toHaveBeenCalledWith({ limit: 20 });
    expect(result.current.data?.map((u) => u.id)).toEqual(['u3', 'u2']);
    expect(result.current.hasNextPage).toBe(true);

    queryClient.clear();
  });

  it('sends the chosen role as the APIS §9.3 filter', async () => {
    jest.spyOn(usersApi, 'listUsers').mockResolvedValue(page2);

    const { result, queryClient } = renderDirectory('Assistant');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(usersApi.listUsers).toHaveBeenCalledWith({
      role: 'Assistant',
      limit: 20,
    });

    queryClient.clear();
  });

  it('follows next_cursor for the next page and stops when has_more is false', async () => {
    jest
      .spyOn(usersApi, 'listUsers')
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const { result, queryClient } = renderDirectory('all');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => {
      void result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data?.map((u) => u.id)).toEqual(['u3', 'u2', 'u1']),
    );
    expect(usersApi.listUsers).toHaveBeenLastCalledWith({
      limit: 20,
      cursor: 'cursor-2',
    });
    expect(result.current.hasNextPage).toBe(false);

    queryClient.clear();
  });

  it('caches each role filter separately so switching chips is a distinct read', async () => {
    jest.spyOn(usersApi, 'listUsers').mockResolvedValue(page2);
    act(() => {
      useAuthStore.setState({ userId: 'admin-1' });
    });

    const { result, queryClient } = renderDirectory('Teacher');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['users', 'Teacher', 'admin-1']),
    ).toBeTruthy();
    expect(
      queryClient.getQueryData(['users', 'all', 'admin-1']),
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
    jest.spyOn(usersApi, 'listUsers').mockRejectedValue(error);

    const { result, queryClient } = renderDirectory('all');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });
});
