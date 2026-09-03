import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IDeviceTokenScope } from '../domain/device-token-scope.interface';

/**
 * TS §15.2 / SA §14 own-scope lookup for `DELETE /devices/{id}`:
 *
 *   SELECT 1 FROM device_tokens WHERE id = :id AND user_id = :caller
 *
 * One literal, parameterised statement (TS §36) on the `device_tokens`
 * primary key. No cache, no cross-module call (SA §14 / DEC-C11).
 */
@Injectable()
export class DeviceTokenScope implements IDeviceTokenScope {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isOwnedByCaller(deviceId: string, userId: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM device_tokens
        WHERE id = $1
          AND user_id = $2
        LIMIT 1`,
      [deviceId, userId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}
