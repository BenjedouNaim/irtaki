import { apiClient } from './client';

export interface UserListItem {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

export interface ListUsersResponse {
  data: UserListItem[];
}

export async function listUsersByRole(
  role?: 'Teacher' | 'Assistant',
): Promise<ListUsersResponse> {
  return apiClient.get<ListUsersResponse>('/users', {
    params: role ? { role } : undefined,
  });
}
