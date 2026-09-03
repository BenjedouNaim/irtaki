import type { NotificationEventType } from './notification-event';
import type { NotificationLogEntry } from './notification-log.entity';

export const NOTIFICATION_LOG_REPOSITORY = Symbol(
  'NOTIFICATION_LOG_REPOSITORY',
);

export interface INotificationLogRepository {
  /** FR-NOTIF-08: one write-once row per dispatch decision (DBT-17). */
  record(entry: NotificationLogEntry): Promise<void>;

  /**
   * ISS-17's cadence guard, resolved exactly as SA §21 specifies — "checked
   * against existing `notification_log` entries before dispatch, no new
   * table needed": has this recipient any `category` row dispatched at or
   * after `since`?
   *
   * ANY outcome counts, not only `Sent`. The question the guard asks is
   * "has this cycle/episode already been decided", and a `Suppressed` or
   * `Failed` decision is still a decision — re-deciding it nightly would
   * reintroduce exactly the daily repetition ISS-17 exists to stop, and
   * BR-60 makes a non-delivery no reason to try again tomorrow.
   */
  hasEntrySince(
    userId: string,
    category: NotificationEventType,
    since: Date,
  ): Promise<boolean>;
}
