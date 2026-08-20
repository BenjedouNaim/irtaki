import { request } from './client';
import { Role } from '../auth/types';

export interface RegisterRequest {
  email: string;
  password: string;
  timezone?: string;
  device_token?: string;
}

export interface RegisterResponse {
  id: string;
  role: Role;
  email: string;
  timezone: string;
  access_token: string;
  refresh_token: string;
}

export async function registerUser(
  data: RegisterRequest,
): Promise<RegisterResponse> {
  return request<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: data,
  });
}
