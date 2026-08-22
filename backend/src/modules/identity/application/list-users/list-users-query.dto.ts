import { IsIn, IsOptional } from 'class-validator';
import { UserRole } from '../../domain/user-role.enum';

export class ListUsersQueryDto {
  @IsOptional()
  @IsIn(Object.values(UserRole), {
    message: 'الدور المحدد غير صالح',
  })
  role?: UserRole;
}
