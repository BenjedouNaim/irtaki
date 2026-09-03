import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import type {
  NotificationCategory,
  NotificationPreference,
} from '../domain/notification-preference.entity';
import {
  INotificationPreferenceRepository,
  NotificationPreferenceRecord,
} from '../domain/notification-preference.repository.interface';

interface RawCategoryRow {
  code: string;
  description: string;
  is_mutable: boolean;
}

interface RawMergedRow extends RawCategoryRow {
  muted: boolean;
}

/**
 * `notification_categories` (DBT-15) + `notification_preferences` (DBT-16)
 * persistence for API-050/API-051.
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

  /**
   * The single DBT-15 row VR-38 is decided on. `is_mutable` is read from the
   * catalogue and never from the request body, so a client claiming a
   * category is mutable changes nothing (SAS §12 UC-18 E1).
   */
  async findCategoryByCode(code: string): Promise<NotificationCategory | null> {
    const rows = await this.dataSource.query<RawCategoryRow[]>(
      `SELECT code, description, is_mutable
         FROM notification_categories
        WHERE code = $1
        LIMIT 1`,
      [code],
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      code: rows[0].code,
      description: rows[0].description,
      isMutable: rows[0].is_mutable,
    };
  }

  /**
   * DB-UQ-10 (`user_id, category`) as one idempotent upsert: the caller's
   * first choice for a category inserts the row, every later choice moves
   * `muted` on that same row — which is why API-051 is a `200` PATCH and
   * never creates a duplicate under a double tap (APIS §9.7). DB-CHK-09's
   * trigger still guards the write as the storage-layer backstop.
   */
  async upsert(preference: NotificationPreference): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ muted: boolean }>>(
      `INSERT INTO notification_preferences (id, user_id, category, muted)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, category) DO UPDATE
          SET muted = EXCLUDED.muted
       RETURNING muted`,
      [uuidv7(), preference.userId, preference.category, preference.muted],
    );

    return rows[0].muted;
  }
}
