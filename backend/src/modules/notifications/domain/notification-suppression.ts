import { isoDayOfWeek } from '../../reports/domain/local-date';

/**
 * The six §22.3 conditions (FR-NOTIF-03), in the order SAS lists them.
 * `CATEGORY_MUTED` and `NO_DEVICE_TOKEN` are evaluated by
 * `NotificationService` for every event — the first is SA §21's own
 * preference step, the second is a physical precondition of any push
 * (UC-15 E1) — while the four membership-context conditions are §22.3's
 * N-01 rule set and are re-checked for the events that declare a
 * membership to re-check against.
 */
export const SUPPRESSION_REASONS = [
  'REPORT_ALREADY_EXISTS',
  'RECITATION_DAY',
  'GROUP_ARCHIVED',
  'MEMBERSHIP_NOT_ACTIVE',
  'CATEGORY_MUTED',
  'NO_DEVICE_TOKEN',
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/**
 * The membership-side inputs of §22.3, as one read of `memberships ⋈ groups
 * ⋈ users` plus the day's report probe resolves them. Every date is a
 * calendar date in the STUDENT's own timezone (T-01, INV-27, DEC-B03) — the
 * server clock is never the day boundary.
 */
export interface MembershipSuppressionContext {
  /** `memberships.state` — `Active` | `Terminated`. */
  membershipState: string;
  /** `groups.lifecycle_state` — `Active` | `Archived`. */
  groupLifecycleState: string;
  /** `groups.recitation_day`, ISO day-of-week 1..7 (DBT-02). */
  recitationDay: number;
  /** The student's local calendar date, `YYYY-MM-DD`. */
  localToday: string;
  /** A live `daily_reports` row dated the student's local today (BR-23). */
  reportExistsToday: boolean;
}

/**
 * SAS §22.3 (FR-NOTIF-03): "N-01 is suppressed when any of the following
 * holds — a Daily Report already exists for the student's local today;
 * today is the group's recitation day; the group's `lifecycle_state` is
 * `Archived`; the Membership is not `Active`; the student has muted the
 * category; no valid device token exists."
 *
 * This function decides the first four (the membership-context half); the
 * mute and device-token halves belong to the dispatch path itself, which
 * holds the preference row and the token set.
 *
 * Returns the FIRST matching reason, or null when none holds. Pure and
 * framework-free (TS §9) — every input is supplied by the caller.
 */
export function evaluateMembershipSuppression(
  context: MembershipSuppressionContext,
): SuppressionReason | null {
  if (context.reportExistsToday) {
    return 'REPORT_ALREADY_EXISTS';
  }
  if (isoDayOfWeek(context.localToday) === context.recitationDay) {
    return 'RECITATION_DAY';
  }
  if (context.groupLifecycleState === 'Archived') {
    return 'GROUP_ARCHIVED';
  }
  if (context.membershipState !== 'Active') {
    return 'MEMBERSHIP_NOT_ACTIVE';
  }
  return null;
}
