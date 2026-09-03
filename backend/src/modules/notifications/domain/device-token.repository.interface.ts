import type { DevicePlatform } from './device-token.entity';
import type { DeviceToken } from './device-token.entity';

export const DEVICE_TOKEN_REPOSITORY = Symbol('DEVICE_TOKEN_REPOSITORY');

/** One `device_tokens` row (DBT-14) as the API represents it. */
export interface DeviceTokenRecord {
  id: string;
  token: string;
  platform: DevicePlatform;
  /** ISO-8601 instant — the first registration, never moved (VR-29). */
  registeredAt: string;
  /** ISO-8601 instant — what a re-registration refreshes (VR-29). */
  lastSeenAt: string;
  /** ISO-8601 instant; null while the token is live (SAS §9 E-09). */
  invalidatedAt: string | null;
}

export interface IDeviceTokenRepository {
  /**
   * VR-29: registers `deviceToken`, or refreshes the existing row bearing
   * the same token instead of duplicating it — one idempotent statement,
   * which is why API-048 answers `200` and never `201` (APIS §9.7).
   * Returns the resulting row either way.
   */
  registerOrRefresh(deviceToken: DeviceToken): Promise<DeviceTokenRecord>;
}
