import type { DevicePlatform } from '../../domain/device-token.entity';

/**
 * `DeviceTokenDto` (TS §13) — one E-09 row as API-048 returns it. APIS
 * §10.12 states the request and the `200`, not the body's fields, so this
 * is the SAS §20 E-09 attribute list minus `user_id`, which is the caller's
 * own id on an "Own" resource and is echoed by no other own-scoped
 * response. `id` is what the client keeps in order to call API-049.
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
export interface RegisterDeviceResponseDto {
  data: DeviceTokenDto;
}
