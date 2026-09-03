import { apiClient } from './client';

export interface UserListItem {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

export interface ListUsersResponse {
  data: UserListItem[];
}

export async function listUsersByRole(
  role?: 'Teacher' | 'Assistant',
): Promise<ListUsersResponse> {
  return apiClient.get<ListUsersResponse>('/users', {
    params: role ? { role } : undefined,
  });
}

/**
 * The two roles BR-R03 allows a `User` to be promoted to (APIS §10.13). No
 * other transition exists on this endpoint — there is no demotion path.
 */
export type PromotableRole = 'Teacher' | 'Assistant';

export interface PromoteUserRoleResponse {
  data: UserListItem;
}

/**
 * `PATCH /users/{id}/role` (API-052). Rejects with `ApiError` carrying
 * `SOURCE_ROLE_NOT_USER` (422) when the target no longer holds `role=User`
 * and `CANNOT_PROMOTE_SELF` (403) for the Admin's own account.
 */
export async function promoteUserRole(
  userId: string,
  role: PromotableRole,
): Promise<PromoteUserRoleResponse> {
  return apiClient.patch<PromoteUserRoleResponse>(`/users/${userId}/role`, {
    role,
  });
}
