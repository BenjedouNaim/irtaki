import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { localDateInTimezone } from '../../reports/domain/local-date';
import type {
  INotificationDispatchContextRepository,
  LiveDeviceToken,
} from '../domain/notification-dispatch-context.repository.interface';
import type { MembershipSuppressionContext } from '../domain/notification-suppression';

interface RawTokenRow {
  id: string;
  token: string;
}

interface RawPreferenceRow {
  is_mutable: boolean;
  muted: boolean;
}

interface RawMembershipContextRow {
  state: string;
  lifecycle_state: string;
  recitation_day: number | string;
  timezone: string;
}

/**
 * The reads `NotificationService` performs while walking SA §21's sequence.
 *
 * They address `memberships`, `groups`, `users` and `daily_reports` — tables
 * other modules own — through this module's OWN infrastructure rather than
 * by injecting those modules' repositories, because SA §11 makes
 * Notifications a subscriber that is never called into and therefore has no
 * inbound edge to borrow. This is the posture the Performance module already
 * takes for the same reason (TS §15.2): one literal parameterised indexed
 * statement per read (TS §36), no post-filtering, no transaction, no lock
 * (TS §19/§20).
 */
@Injectable()
export class NotificationDispatchContextRepository implements INotificationDispatchContextRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** §22.3 "no valid device token exists" — `invalidated_at IS NULL` (E-09). */
  async findLiveDeviceTokens(userId: string): Promise<LiveDeviceToken[]> {
    const rows = await this.dataSource.query<RawTokenRow[]>(
      `SELECT id, token
         FROM device_tokens
        WHERE user_id = $1
          AND invalidated_at IS NULL
        ORDER BY last_seen_at DESC`,
      [userId],
    );
    return rows.map((row) => ({ id: row.id, token: row.token }));
  }

  /**
   * UC-15 E2 / SAS §22.5: a transport-reported invalid token is marked
   * `invalidated_at`, never physically deleted here — DBD §25's permitted
   * physical delete belongs to API-049, and E-09 keeps invalidation as a
   * distinct logical state.
   */
  async invalidateDeviceToken(tokenId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE device_tokens
          SET invalidated_at = now()
        WHERE id = $1
          AND invalidated_at IS NULL`,
      [tokenId],
    );
  }

  /**
   * The DBT-15 catalogue row LEFT JOINed onto this user's DBT-16 preference
   * through DB-IDX-09 — `is_mutable` (BR-61's authority) and `muted` with
   * R-15's "absent = unmuted" resolved in the query, exactly as API-050's
   * own read does.
   */
  async findPreference(
    userId: string,
    category: string,
  ): Promise<{ isMutable: boolean; muted: boolean } | null> {
    const rows = await this.dataSource.query<RawPreferenceRow[]>(
      `SELECT c.is_mutable,
              COALESCE(p.muted, false) AS muted
         FROM notification_categories c
         LEFT JOIN notification_preferences p
                ON p.category = c.code
               AND p.user_id = $1
        WHERE c.code = $2
        LIMIT 1`,
      [userId, category],
    );
    if (rows.length === 0) {
      return null;
    }
    return { isMutable: rows[0].is_mutable, muted: rows[0].muted };
  }

  /**
   * §22.3's four membership-context conditions. Two statements, both
   * parameterised and indexed: the context join first, because the student's
   * own `users.timezone` decides which calendar date "today" is (T-01,
   * INV-27) and therefore which day the report probe asks about — the local
   * date is computed by the shared `localDateInTimezone` primitive, so this
   * path and every other day-boundary evaluation in the system agree.
   */
  async findMembershipSuppressionContext(
    membershipId: string,
    now: Date,
  ): Promise<MembershipSuppressionContext | null> {
    const rows = await this.dataSource.query<RawMembershipContextRow[]>(
      `SELECT m.state,
              g.lifecycle_state,
              g.recitation_day,
              u.timezone
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
         JOIN users u ON u.id = m.user_id
        WHERE m.id = $1
        LIMIT 1`,
      [membershipId],
    );
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const localToday = localDateInTimezone(now, row.timezone);

    const reportRows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
                SELECT 1
                  FROM daily_reports
                 WHERE membership_id = $1
                   AND report_date = $2
                   AND deleted_at IS NULL
              ) AS exists`,
      [membershipId, localToday],
    );

    return {
      membershipState: row.state,
      groupLifecycleState: row.lifecycle_state,
      recitationDay: Number(row.recitation_day),
      localToday,
      reportExistsToday: reportRows[0].exists,
    };
  }

  /** DE-09's recipient: the Student whose membership was terminated. */
  async findMembershipHolderUserId(
    membershipId: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT user_id FROM memberships WHERE id = $1 LIMIT 1`,
      [membershipId],
    );
    return rows.length === 0 ? null : rows[0].user_id;
  }

  /** DE-01's recipient: the Assistant of the group applied to (SAS §22.2). */
  async findGroupAssistantUserId(groupId: string): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ assistant_id: string }>>(
      `SELECT assistant_id FROM groups WHERE id = $1 LIMIT 1`,
      [groupId],
    );
    return rows.length === 0 ? null : rows[0].assistant_id;
  }
}
