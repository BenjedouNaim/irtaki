import { apiClient } from './client';

export type DevicePlatform = 'Android' | 'iOS';
export interface DeviceRegistration {
  id: string;
  token: string;
  platform: DevicePlatform;
}

/** Explicit owner credentials prevent a delayed operation using a new account. */
export async function registerDevice(
  token: string,
  platform: DevicePlatform,
  accessToken: string,
): Promise<DeviceRegistration> {
  const response = await apiClient.post<{ data: DeviceRegistration }>(
    '/devices',
    { token, platform },
    { skipAuth: true, headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return response.data;
}

export async function unregisterDevice(
  id: string,
  accessToken: string,
): Promise<void> {
  await apiClient.delete(`/devices/${encodeURIComponent(id)}`, {
    skipAuth: true,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
