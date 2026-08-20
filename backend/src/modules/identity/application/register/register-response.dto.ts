import { UserRole } from '../../domain/user-role.enum';

export interface RegisterResponseDto {
  id: string;
  role: UserRole;
  email: string;
  timezone: string;
  access_token: string;
  refresh_token: string;
}
