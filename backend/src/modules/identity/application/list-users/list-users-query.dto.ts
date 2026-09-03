import { IsIn, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../../domain/user-role.enum';

/**
 * API-053 `GET /users?role=` query. `role` is the one named filter for this
 * endpoint (APIS §9.3) and stays optional — omitted means the unfiltered,
 * all-roles directory SCR-32 renders. `limit` is clamped, never rejected
 * (APIS §9.2), so it carries no validator; `cursor` is opaque and decoded by
 * the use case.
 */
export class ListUsersQueryDto {
  @IsOptional()
  @IsIn(Object.values(UserRole), {
    message: 'الدور المحدد غير صالح',
  })
  role?: UserRole;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  limit?: string | number;
}
