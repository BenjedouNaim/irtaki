import { apiClient } from './client';
import { Role } from '../auth/types';

export interface MeResponse {
  id: string;
  role: Role;
  email: string;
  full_name: string | null;
  gender: 'Male' | 'Female' | null;
  timezone: string;
}

export interface UpdateProfileRequest {
  timezone?: string;
}

export async function getMe(): Promise<MeResponse> {
  return apiClient.get<MeResponse>('/me');
}

export async function updateProfile(
  data: UpdateProfileRequest,
): Promise<MeResponse> {
  return apiClient.patch<MeResponse>('/me', data);
}
