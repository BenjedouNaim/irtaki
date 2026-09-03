import { DeviceTokenRecord } from '../domain/device-token.repository.interface';
import { DeviceTokenDto } from './register-device/register-device-response.dto';

/** One `device_tokens` record → the `DeviceTokenDto` wire shape (TS §13). */
export function toDeviceTokenDto(record: DeviceTokenRecord): DeviceTokenDto {
  return {
    id: record.id,
    token: record.token,
    platform: record.platform,
    registered_at: record.registeredAt,
    last_seen_at: record.lastSeenAt,
    invalidated_at: record.invalidatedAt,
  };
}
