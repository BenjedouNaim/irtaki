import { apiClient } from './client';

/** DBT-14 `platform` / APIS §10.12 request contract — exactly these two. */
export type DevicePlatform = 'iOS' | 'Android';

/** API-048 `POST /devices` request body (APIS §10.12). */
export interface RegisterDevicePayload {
  token: string;
  platform: DevicePlatform;
}

/**
 * One E-09 DeviceToken as API-048 returns it (`DeviceTokenDto`, TS §13).
 * `id` is what the client keeps in order to call API-049 later.
 */
export interface DeviceTokenDto {
  id: string;
  token: string;
  platform: DevicePlatform;
  /** ISO-8601 instant. */
  registered_at: string;
  /** ISO-8601 instant — moved by every re-registration (VR-29). */
  last_seen_at: string;
  /** ISO-8601 instant; null while the token is live. */
  invalidated_at: string | null;
}

/** APIS §9.1 single-resource envelope. */
export interface RegisterDeviceResponse {
  data: DeviceTokenDto;
}

/**
 * Registers or refreshes this install's push token (API-048), unwrapping
 * the APIS §9.1 envelope. Safe to call on every launch: the endpoint is
 * genuinely idempotent — re-sending the same token refreshes `last_seen_at`
 * rather than creating a row, and answers `200`, never `201` (VR-29,
 * APIS §9.7). Errors surface as `ApiError` unchanged.
 */
export async function registerDevice(
  payload: RegisterDevicePayload,
): Promise<DeviceTokenDto> {
  const response = await apiClient.post<RegisterDeviceResponse>(
    '/devices',
    payload,
  );
  return response.data;
}
