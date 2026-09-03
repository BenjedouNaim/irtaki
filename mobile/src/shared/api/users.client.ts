import { apiClient } from './client';

/** The five roles E-01 User can hold (DMS, APIS §10.13). */
export type UserRoleName =
  'Admin' | 'Teacher' | 'Assistant' | 'Student' | 'User';

export interface UserListItem {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

/** APIS §9.1 collection envelope — cursor block, no totals. */
export interface ListUsersResponse {
  data: UserListItem[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

/**
 * API-053 `GET /users?role=` query: the §9.3 `role` filter plus the §9.2
 * cursor params `/users` carries as an unbounded collection (SA §15
 * API-X04). Omitting `role` returns every role — the directory SCR-32 shows.
 */
export interface ListUsersParams {
  role?: UserRoleName;
  cursor?: string;
  limit?: number;
}

/**
 * One page of the user directory (API-053), `created_at DESC` (APIS §9.4).
 * Returns the whole `{ data, pagination }` envelope because the cursor
 * block is part of what the list screen consumes.
 */
export async function listUsers(
  params: ListUsersParams = {},
): Promise<ListUsersResponse> {
  return apiClient.get<ListUsersResponse>('/users', {
    params: {
      ...(params.role ? { role: params.role } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    },
  });
}

/**
 * The staff-assignment picker read (F-GRP-04): every Teacher or every
 * Assistant, in one call. It asks for the largest page APIS §9.2 allows
 * (100) because the picker renders a complete choice list rather than an
 * infinite scroll — a centre with more than 100 accounts in one staff role
 * is far outside anything the single-centre scope (SRS §13) describes.
 */
export async function listUsersByRole(
  role?: 'Teacher' | 'Assistant',
): Promise<ListUsersResponse> {
  return listUsers({ role, limit: 100 });
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
