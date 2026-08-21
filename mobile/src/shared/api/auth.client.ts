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

export interface LoginRequest {
  email: string;
  password: string;
  device_token?: string;
}

export interface LoginResponse {
  id: string;
  role: Role;
  full_name: string | null;
  gender: 'Male' | 'Female' | null;
  timezone: string;
  access_token: string;
  refresh_token: string;
  dashboard_route: string;
}

export async function registerUser(
  data: RegisterRequest,
): Promise<RegisterResponse> {
  return request<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: data,
  });
}

export async function loginUser(data: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: data,
  });
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export async function refreshSession(
  refreshToken: string,
): Promise<RefreshResponse> {
  return request<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
    body: {
      refresh_token: refreshToken,
    },
  });
}

export async function logoutUser(refreshToken: string): Promise<void> {
  return request<void>('/auth/logout', {
    method: 'POST',
    body: {
      refresh_token: refreshToken,
    },
  });
}
