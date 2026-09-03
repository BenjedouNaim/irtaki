/**
 * Daily-report submission eligibility (E-05 invariants, DMS §7.1):
 * a DailyReport "cannot be created on the Group's recitation day, or when
 * the Group is Archived, or for any date but today", and "at most one per
 * (Membership, date)" (INV-11). The membership must be Active (VR-35).
 *
 * Pure domain rule — no I/O (TS §9). Shared by API-029 (status read) and,
 * later, API-030 (submission) so both paths agree on the block reason.
 */

/** APIS §10.7 `block_reason` enumeration — exact wire values. */
export type DailyReportBlockReason =
  | 'already_submitted'
  | 'recitation_day'
  | 'group_archived'
  | 'membership_inactive';

export interface DailyReportEligibilityInput {
  /** `false` when the caller has no Active membership (VR-35). */
  membershipActive: boolean;
  /** `groups.lifecycle_state` of the membership's group (FR-DR-11, INV-21). */
  groupLifecycleState: string;
  /** `groups.recitation_day`, ISO day-of-week 1..7 (BR-16, VR-12). */
  recitationDay: number;
  /** ISO day-of-week of "today" in the student's timezone (VR-10, T-01). */
  todayIsoDay: number;
  /** Whether a live report already exists for (membership, today) (VR-11). */
  hasReportForToday: boolean;
}

export type DailyReportEligibility =
  | { canSubmit: true; blockReason?: undefined }
  | { canSubmit: false; blockReason: DailyReportBlockReason };

/**
 * Evaluates the preconditions of UC-05 in their stated order (SAS §12 UC-05:
 * "Active Membership; group Active; today is not the recitation day; no
 * report exists for today") and reports the first one that fails.
 */
export function evaluateDailyReportEligibility(
  input: DailyReportEligibilityInput,
): DailyReportEligibility {
  if (!input.membershipActive) {
    return { canSubmit: false, blockReason: 'membership_inactive' };
  }
  if (input.groupLifecycleState === 'Archived') {
    return { canSubmit: false, blockReason: 'group_archived' };
  }
  if (input.todayIsoDay === input.recitationDay) {
    return { canSubmit: false, blockReason: 'recitation_day' };
  }
  if (input.hasReportForToday) {
    return { canSubmit: false, blockReason: 'already_submitted' };
  }
  return { canSubmit: true };
}
