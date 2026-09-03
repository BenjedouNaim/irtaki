import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import type {
  DeviceToken,
  DevicePlatform,
} from '../domain/device-token.entity';
import {
  DeviceTokenRecord,
  IDeviceTokenRepository,
} from '../domain/device-token.repository.interface';
import { DeviceTokenTypeOrmEntity } from './device-token.typeorm-entity';

interface RawDeviceTokenRow {
  id: string;
  token: string;
  platform: string;
  registered_at: string | Date;
  last_seen_at: string | Date;
  invalidated_at: string | Date | null;
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function toRecord(row: RawDeviceTokenRow): DeviceTokenRecord {
  return {
    id: row.id,
    token: row.token,
    platform: row.platform as DevicePlatform,
    registeredAt: toIso(row.registered_at),
    lastSeenAt: toIso(row.last_seen_at),
    invalidatedAt:
      row.invalidated_at === null ? null : toIso(row.invalidated_at),
  };
}

/**
 * `device_tokens` (DBT-14) persistence for API-048/API-049.
 *
 * No transaction and no locking (TS §19/§20): each operation is a single
 * auto-committed statement, and each is one literal parameterised
 * statement (TS §36).
 */
@Injectable()
export class DeviceTokenRepository implements IDeviceTokenRepository {
  constructor(
    @InjectRepository(DeviceTokenTypeOrmEntity)
    private readonly deviceTokenRepo: Repository<DeviceTokenTypeOrmEntity>,
  ) {}

  /**
   * VR-29 as a single idempotent upsert on the `device_tokens.token` unique
   * constraint (DBD §25): a token the database has never seen is inserted,
   * a token it already holds has `last_seen_at` refreshed rather than being
   * duplicated. `registered_at` is deliberately NOT moved — VR-29 refreshes
   * `last_seen_at` only. `invalidated_at` is cleared because the row has, by
   * definition, just been registered again (SAS §9 E-09 `registered →
   * invalidated`, and back on re-registration).
   *
   * `user_id` is written from the caller on both paths: the unique
   * constraint is global on `token`, so a handset whose owner changed
   * re-registers onto the new caller rather than colliding — API-048 has no
   * documented conflict answer (APIS §9.7 lists it as always `200`).
   */
  async registerOrRefresh(
    deviceToken: DeviceToken,
  ): Promise<DeviceTokenRecord> {
    const rows = await this.deviceTokenRepo.query<RawDeviceTokenRow[]>(
      `INSERT INTO device_tokens (
         id, user_id, token, platform, registered_at, last_seen_at, invalidated_at
       ) VALUES ($1, $2, $3, $4, now(), now(), NULL)
       ON CONFLICT (token) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              platform = EXCLUDED.platform,
              last_seen_at = now(),
              invalidated_at = NULL
       RETURNING id, token, platform, registered_at, last_seen_at, invalidated_at`,
      [uuidv7(), deviceToken.userId, deviceToken.token, deviceToken.platform],
    );

    return toRecord(rows[0]);
  }
}
