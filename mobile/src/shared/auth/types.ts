export type Role = 'User' | 'Student' | 'Assistant' | 'Teacher' | 'Admin';

export interface UserSession {
  accessToken: string;
  role: Role;
}
