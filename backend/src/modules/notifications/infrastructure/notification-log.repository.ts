import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import type { NotificationEventType } from '../domain/notification-event';
import type { NotificationLogEntry } from '../domain/notification-log.entity';
import type { INotificationLogRepository } from '../domain/notification-log.repository.interface';

/**
 * `notification_log` (DBT-17) persistence. Write-once, insert-only (DMS
 * §7.2): there is no update and no delete, and no retention policy exists
 * (ISS-08/TDR-03, accepted for MVP).
 *
 * No transaction and no locking (TS §19/§20): each operation is a single
 * auto-committed, literal parameterised statement (TS §36), reading through
 * `idx_notification_log_user_category`.
 */
@Injectable()
export class NotificationLogRepository implements INotificationLogRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async record(entry: NotificationLogEntry): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO notification_log
         (id, user_id, category, subject_id, dispatched_at, outcome,
          transport_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv7(),
        entry.userId,
        entry.category,
        entry.subjectId,
        entry.dispatchedAt,
        entry.outcome,
        entry.transportReference,
      ],
    );
  }

  /**
   * ISS-17's cadence guard (SA §21): one indexed existence probe over
   * `(user_id, category)` bounded by `dispatched_at`. `EXISTS` rather than a
   * count — the question is binary and the planner can stop at the first row.
   */
  async hasEntrySince(
    userId: string,
    category: NotificationEventType,
    since: Date,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
                SELECT 1
                  FROM notification_log
                 WHERE user_id = $1
                   AND category = $2
                   AND dispatched_at >= $3
              ) AS exists`,
      [userId, category, since],
    );
    return rows[0].exists;
  }

  /**
   * ISS #135's narrowed guard: the same existence probe with `subject_id`
   * added, reading through `idx_notification_log_user_category_subject`
   * whose columns are `(user_id, category, subject_id, dispatched_at)` in
   * that order — the four predicates below, in index order, so the planner
   * resolves the whole thing from the index.
   */
  async hasEntryForSubjectSince(
    userId: string,
    category: NotificationEventType,
    subjectId: string,
    since: Date,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
                SELECT 1
                  FROM notification_log
                 WHERE user_id = $1
                   AND category = $2
                   AND subject_id = $3
                   AND dispatched_at >= $4
              ) AS exists`,
      [userId, category, subjectId, since],
    );
    return rows[0].exists;
  }
}
