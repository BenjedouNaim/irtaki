import { UserRole } from '../../domain/user-role.enum';

export class UserListItemDto {
  id!: string;
  email!: string;
  full_name!: string | null;
  role!: UserRole;
}

/**
 * API-053 payload — APIS §9.1 collection envelope: `UserListItemDto[]` plus
 * the cursor block `/users` carries as an unbounded collection (APIS §9.2,
 * SA §15 API-X04). `next_cursor` is `null` whenever `has_more` is `false`;
 * no totals are ever returned.
 */
export class ListUsersResponseDto {
  data!: UserListItemDto[];
  pagination!: {
    next_cursor: string | null;
    has_more: boolean;
  };
}
