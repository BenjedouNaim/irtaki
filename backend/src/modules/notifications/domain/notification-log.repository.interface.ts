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

  /**
   * ISS #135: the same guard, narrowed to the ONE subject the notification
   * would be about (`notification_log.subject_id`).
   *
   * `hasEntrySince` above asks "has this recipient been told about anything
   * of this category since `since`", which is exact only while a recipient
   * can hold at most one live subject — true of N-06 (DB-UQ-02: one `Active`
   * membership per user), false of N-07, whose recipient is the Teacher of a
   * whole group. This overload asks "has this recipient been told about THIS
   * subject", so each at-risk student keeps its own once-per-episode window.
   *
   * The outcome rule is `hasEntrySince`'s, unchanged: ANY outcome counts,
   * because a `Suppressed` or `Failed` row is still a decision and BR-60
   * makes a non-delivery no reason to retry tomorrow.
   */
  hasEntryForSubjectSince(
    userId: string,
    category: NotificationEventType,
    subjectId: string,
    since: Date,
  ): Promise<boolean>;
}
