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
 * `subjectId` is a seventh field, added by ISS #135 — see its own doc below
 * for why, and for the caveat that it is an addition beyond DBD.md's ERD.
 *
 * Framework-free (TS §9).
 */
export interface NotificationLogEntry {
  /** The RECIPIENT's `users.id` — never the subject of the notification. */
  userId: string;
  category: NotificationEventType;
  /**
   * WHAT the notification was about, as opposed to WHO it went to — the
   * same identifier BR-46 lets the payload carry (`PushPayload.resourceId`),
   * persisted so the SA §21 cadence guard can ask about a (recipient,
   * subject) pair instead of a recipient alone.
   *
   * ⚠️ **Addition beyond DBD.md's ERD.** DBD §"`notification_log` (DBT-17)"
   * defines six columns and does not contemplate a subject. This column is
   * authorised by issue #135's task list ("Add a nullable subject reference
   * to `notification_log` … with a migration"), which AGENTS §12 makes the
   * work order, NOT by a doc. `docs/` is read-only (AGENTS §2.5), so the DBD
   * correction is a separate, flagged action still pending with the Product
   * Owner. Until it lands, DBD and this schema disagree by one column and
   * this comment is the record of why.
   *
   * Polymorphic and therefore FK-less, exactly like `audit_entries.target_id`
   * (DBT-18): a `memberships.id` for six of the eight events, a
   * `join_requests.id` for the other two. Nullable for the write-once rows
   * that predate the column (DMS §7.2 forbids backfilling them by update).
   *
   * ---
   *
   * **Issue #135, task 4 — the eight events of SAS §22.2, classified.**
   * "Per-recipient" below means the recipient can hold at most one live
   * subject of that kind at a time, so recipient-level dedup is already
   * exact and the subject adds nothing but provenance. "Per-subject" means
   * one recipient can be told about many subjects, so a guard keyed on the
   * recipient alone conflates them. Every call site was read to fix the
   * subject; each row names it.
   *
   * | Event (SAS §22.2) | Recipient (SAS §22.2) | Subject written here | Call site | Classification |
   * |---|---|---|---|---|
   * | **N-01** daily report not yet submitted | Student | their own `memberships.id` | `DailyReminderEvaluator.evaluate` — `resourceId: candidate.membershipId`, recipient `candidate.userId` | **Per-recipient** — DB-UQ-02 allows one `Active` membership per user, so recipient and subject are the same person's one row |
   * | **N-02** weekly report available | Student | their own `memberships.id` | `WeeklyReportAvailableEvaluator.evaluate` — `resourceId: candidate.membershipId`, recipient `candidate.userId` | **Per-recipient** — same DB-UQ-02 argument |
   * | **N-03** join request accepted | Applicant | the new `memberships.id` | `EnrollmentNotificationListener.onJoinRequestAccepted` — `resourceId: event.membershipId`, recipient `event.applicantUserId` | **Per-recipient** — the membership DS-01 just created for that applicant |
   * | **N-04** join request rejected | Applicant | the `join_requests.id` | `EnrollmentNotificationListener.onJoinRequestRejected` and `GroupNotificationListener.onGroupArchived` | **Per-recipient** — DB-UQ-03 allows one `Pending` request per user, so an applicant has exactly one rejectable subject. The subject is still written, and #133's duplicate-delivery guard reads it |
   * | **N-05** new join request received | Assistant of the target group | the `join_requests.id` | `EnrollmentNotificationListener.onJoinRequestSubmitted` — `resourceId: event.joinRequestId`, recipient resolved from `groups.assistant_id` | **Per-subject** — one Assistant serves many applicants. Harmless today only because DE-01 is event-driven and carries no cadence guard; any guard added later MUST use the subject |
   * | **N-06** payment due soon | Student | their own `memberships.id` | `PaymentDueSoonEvaluator.evaluate` — `resourceId: candidate.membershipId`, recipient `candidate.userId` | **Per-recipient** — the cycle belongs to the recipient's own membership, so `hasEntrySince` stays exact and is deliberately left unnarrowed (issue #135: "N-06's behaviour is unchanged") |
   * | **N-07** student at risk | Teacher of that group | the at-risk student's `memberships.id` | `AtRiskEvaluator.evaluate` — `resourceId: candidate.membershipId`, recipient `candidate.teacherUserId` | **Per-subject — the defect #135 reports.** One Teacher, many students; the guard is narrowed to (recipient, subject) |
   * | **N-08** removed from group | Student | their own `memberships.id` | `MembershipNotificationListener.onMembershipTerminated` — `resourceId: event.membershipId`, recipient resolved from `memberships.user_id` | **Per-recipient** — the terminated membership is the recipient's own |
   */
  subjectId: string | null;
  outcome: NotificationOutcome;
  /** Provider message id; null for `Suppressed` and for a failed send. */
  transportReference: string | null;
  dispatchedAt: Date;
}
