import { UserRole } from '../../domain/user-role.enum';

export interface LoginResponseDto {
  id: string;
  role: UserRole;
  full_name: string | null;
  gender: 'Male' | 'Female' | null;
  timezone: string;
  access_token: string;
  refresh_token: string;
  dashboard_route: string;
}
