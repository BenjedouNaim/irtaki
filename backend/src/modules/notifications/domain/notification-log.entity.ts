import type { NotificationEventType } from './notification-event';

/**
 * `notification_log.outcome` (DBT-17) — the three values the column's CHECK
 * constraint admits. DBD is the authority on the wording here: F-NOT-05's
 * issue text calls the first one "DISPATCHED", the schema calls it `Sent`,
 * and a doc beats issue prose (AGENTS §2.4), so `Sent` is what is stored and
 * `Dispatched` is only how the code reads.
 */
export const NOTIFICATION_OUTCOMES = ['Sent', 'Failed', 'Suppressed'] as const;

export type NotificationOutcome = (typeof NOTIFICATION_OUTCOMES)[number];

/** Named aliases for the three outcomes SA §21's sequence logs. */
export const DISPATCHED: NotificationOutcome = 'Sent';
export const FAILED: NotificationOutcome = 'Failed';
export const SUPPRESSED: NotificationOutcome = 'Suppressed';

/**
 * E-11 NotificationLog (DMS §20, SAS §1061, DBT-17): `id`, `user_id`,
 * `category`, `dispatched_at`, `outcome`, `transport_reference` — a
 * write-once supporting-subdomain record with no invariant beyond
 * "insert-only" (DMS §7.2). FR-NOTIF-08 makes it the observability feed of
 * TS §31's notification-dispatch-outcome counter.
 *
 * Framework-free (TS §9).
 */
export interface NotificationLogEntry {
  /** The RECIPIENT's `users.id` — never the subject of the notification. */
  userId: string;
  category: NotificationEventType;
  outcome: NotificationOutcome;
  /** Provider message id; null for `Suppressed` and for a failed send. */
  transportReference: string | null;
  dispatchedAt: Date;
}
