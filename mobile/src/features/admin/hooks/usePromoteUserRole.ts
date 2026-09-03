import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  promoteUserRole,
  PromotableRole,
  UserListItem,
} from '@/shared/api/users.client';

/**
 * The user directory read (`GET /users`, API-053) that SCR-32 renders. Declared
 * here because the promotion is the only write that changes it; the list screen
 * reuses this key rather than declaring a second one (TS §26).
 */
export const USERS_QUERY_KEY = ['users'] as const;

/**
 * Query keys a promotion invalidates. A promotion changes exactly one thing —
 * the promoted account's role — so the user directory is the only affected
 * read. It does not touch groups: staff assignment is a separate action
 * (API-016), and nothing about existing groups changes when a new Teacher or
 * Assistant becomes assignable.
 */
export const PROMOTE_USER_ROLE_INVALIDATES = [USERS_QUERY_KEY] as const;

export interface PromoteUserRoleVariables {
  userId: string;
  role: PromotableRole;
}

/**
 * F-ADM-01 / UC-17 — promote a User to Teacher or Assistant (API-052).
 * Errors are surfaced unchanged for the caller to map through UF §24; the
 * hook never swallows a `422 SOURCE_ROLE_NOT_USER` or `403 CANNOT_PROMOTE_SELF`.
 */
export function usePromoteUserRole() {
  const queryClient = useQueryClient();

  return useMutation<UserListItem, Error, PromoteUserRoleVariables>({
    mutationFn: async ({ userId, role }) => {
      const response = await promoteUserRole(userId, role);
      return response.data;
    },
    onSuccess: async () => {
      await Promise.all(
        PROMOTE_USER_ROLE_INVALIDATES.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
    },
  });
}
