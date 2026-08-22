import { UserRole } from '../../domain/user-role.enum';

export class UserListItemDto {
  id!: string;
  email!: string;
  full_name!: string | null;
  role!: UserRole;
}

export class ListUsersResponseDto {
  data!: UserListItemDto[];
}
