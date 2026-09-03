import { UserListItemDto } from '../list-users/user-list-item.dto';

/**
 * `PATCH /users/{id}/role` response envelope (APIS §9.1). The payload is the
 * same `{ id, email, full_name, role }` user shape `GET /users` returns
 * (TS §13 names both `UserDto`), so the client can update the row in place.
 */
export class PromoteRoleResponseDto {
  data!: UserListItemDto;
}
