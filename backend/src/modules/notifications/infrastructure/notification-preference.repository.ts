import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  INotificationPreferenceRepository,
  NotificationPreferenceRecord,
} from '../domain/notification-preference.repository.interface';

interface RawMergedRow {
  code: string;
  description: string;
  is_mutable: boolean;
  muted: boolean;
}

/**
 * `notification_categories` (DBT-15) + `notification_preferences` (DBT-16)
 * persistence for API-050.
 *
 * No transaction and no locking (TS §19/§20): each operation is a single
 * auto-committed statement, and each is one literal parameterised statement
 * (TS §36).
 */
@Injectable()
export class NotificationPreferenceRepository implements INotificationPreferenceRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * APIQ-10 in one indexed query: the whole DBT-15 catalogue LEFT JOINed
   * onto this caller's DBT-16 rows through DB-IDX-09
   * (`notification_preferences(user_id, category)`). `COALESCE(p.muted,
   * false)` is R-15's "absent = unmuted" — a category the caller has never
   * touched comes back unmuted rather than missing, which is exactly what
   * APIS §10.12 requires ("every category from `notification_categories`
   * appears").
   *
   * Ordered by `code` — the SAS §22.2 N-01…N-08 catalogue order. APIS §9.4
   * fixes no order for this endpoint; a deterministic one keeps the screen
   * stable across reads.
   */
  async findCatalogForUser(
    userId: string,
  ): Promise<NotificationPreferenceRecord[]> {
    const rows = await this.dataSource.query<RawMergedRow[]>(
      `SELECT c.code,
              c.description,
              c.is_mutable,
              COALESCE(p.muted, false) AS muted
         FROM notification_categories c
         LEFT JOIN notification_preferences p
                ON p.category = c.code
               AND p.user_id = $1
        ORDER BY c.code ASC`,
      [userId],
    );

    return rows.map((row) => ({
      code: row.code,
      description: row.description,
      isMutable: row.is_mutable,
      muted: row.muted,
    }));
  }
}
