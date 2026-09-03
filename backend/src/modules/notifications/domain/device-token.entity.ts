import {
  DeviceTokenValidationError,
  DeviceTokenValidationErrorDetail,
} from './device-token.errors';

/**
 * DBT-14 `platform` CHECK (`iOS` / `Android`) and the APIS §10.12 request
 * contract — the same two values, spelled exactly as the API spells them.
 */
export const DEVICE_PLATFORMS = ['iOS', 'Android'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** What a caller may supply to `POST /devices` (APIS §10.12). */
export interface RegisterDeviceProps {
  /** The authenticated caller — never taken from the request body. */
  userId: string;
  token: string;
  platform: string;
}

/**
 * E-09 DeviceToken (DMS §7 / SAS §20, supporting subdomain): one push
 * destination belonging to one User. Lifecycle `registered → invalidated`
 * (SAS §9 E-09) — `invalidated_at` is the logical half; the physical row is
 * the sole hard-delete exception in the schema (DBD §25, ADR-007).
 *
 * The domain half of TS §21's validation stack for `POST /devices`:
 * `platform` must be one of the two DBT-14 CHECK values and `token` must
 * carry an actual value. VR-29's uniqueness is deliberately NOT enforced
 * here — it is a database constraint on `device_tokens.token` (DBD §25),
 * and the idempotent refresh it produces is the repository's upsert, which
 * is what makes this endpoint `200` rather than `201` (APIS §9.7).
 *
 * Framework-free (TS §9). Instances are frozen — a registration is a value.
 */
export class DeviceToken {
  private constructor(
    public readonly userId: string,
    public readonly token: string,
    public readonly platform: DevicePlatform,
  ) {
    Object.freeze(this);
  }

  static register(props: RegisterDeviceProps): DeviceToken {
    const details: DeviceTokenValidationErrorDetail[] = [];
    const token = typeof props.token === 'string' ? props.token.trim() : '';

    if (token.length === 0) {
      details.push({
        field: 'token',
        rule: 'DBT-14',
        message: 'رمز الجهاز مطلوب',
      });
    }

    if (!DEVICE_PLATFORMS.includes(props.platform as DevicePlatform)) {
      details.push({
        field: 'platform',
        rule: 'DBT-14',
        message: 'المنصة يجب أن تكون iOS أو Android',
      });
    }

    if (details.length > 0) {
      throw new DeviceTokenValidationError(details);
    }

    return new DeviceToken(
      props.userId,
      token,
      props.platform as DevicePlatform,
    );
  }
}
