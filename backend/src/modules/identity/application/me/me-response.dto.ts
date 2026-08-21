import { UserRole } from '../../domain/user-role.enum';

export interface MeResponseDto {
  id: string;
  role: UserRole;
  email: string;
  full_name: string | null;
  gender: 'Male' | 'Female' | null;
  timezone: string;
}
