import { useInfiniteQuery } from '@tanstack/react-query';
import {
  listUsers,
  ListUsersResponse,
  UserRoleName,
} from '@/shared/api/users.client';
import { useAuthStore } from '@/shared/auth';
import { USERS_QUERY_KEY } from './usePromoteUserRole';

/**
 * SCR-32's role filter (Figma 42:425): "الكل" plus the four roles the frame
 * offers. `all` sends no `role` param and gets the unfiltered directory;
 * anything else is APIS §9.3's `role` filter — the same one the F-GRP-04
 * staff picker uses.
 */
export type UserRoleFilter = 'all' | UserRoleName;

/** APIS §9.2 default page size, and what the list scrolls in. */
export const USERS_PAGE_SIZE = 20;

/**
 * Keyed by endpoint + params (TS §26) under the shared `['users']` root, so
 * a promotion invalidating that root refreshes every filter at once, and by
 * viewer so a page fetched by one account is never shown to another.
 */
export function usersDirectoryQueryKey(
  role: UserRoleFilter,
  userId?: string | null,
) {
  return [...USERS_QUERY_KEY, role, userId ?? 'anonymous'] as const;
}

export type UsersDirectoryQueryKey = ReturnType<typeof usersDirectoryQueryKey>;

/**
 * F-ADM-02 / API-053 — the Admin's user directory, `created_at DESC`
 * (APIS §9.4), cursor-paginated as SA §15's API-X04 requires: page param =
 * the opaque `next_cursor`, `undefined` for the first page, none once
 * `has_more` is false. Pages are flattened because the screen only ever
 * wants the rows in order.
 */
export function useUsersDirectory(role: UserRoleFilter) {
  const userId = useAuthStore((s) => s.userId);

  return useInfiniteQuery<
    ListUsersResponse,
    Error,
    ListUsersResponse['data'],
    UsersDirectoryQueryKey,
    string | undefined
  >({
    queryKey: usersDirectoryQueryKey(role, userId),
    queryFn: ({ pageParam }) =>
      listUsers({
        ...(role === 'all' ? {} : { role }),
        limit: USERS_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more && lastPage.pagination.next_cursor
        ? lastPage.pagination.next_cursor
        : undefined,
    select: (result) => result.pages.flatMap((page) => page.data),
  });
}
