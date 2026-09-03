export const DAILY_REPORT_REPOSITORY = Symbol('DAILY_REPORT_REPOSITORY');

/**
 * Everything API-029 needs to evaluate eligibility for the caller's Active
 * membership, resolved by ONE indexed lookup (TS §15.2) joined on
 * `memberships` (`user_id = :caller AND state = 'Active'`), `groups` and
 * `users` — scope is applied in the query, never post-filtered.
 */
export interface TodayReportContextRecord {
  membershipId: string;
  groupId: string;
  /** `groups.lifecycle_state` — `Active` | `Archived`. */
  groupLifecycleState: string;
  /** `groups.recitation_day`, ISO day-of-week 1..7. */
  recitationDay: number;
  /** `users.timezone` — the day-boundary authority (T-01, INV-27). */
  timezone: string;
}

/** VO-01 AyahPosition as surah/ayah (APIS §11: never raw ordinals). */
export interface DailyReportAyahPositionRecord {
  surah: number;
  ayah: number;
}

/** One live `daily_reports` row (DBT-06), ordinals already resolved to positions. */
export interface DailyReportRecord {
  id: string;
  membershipId: string;
  /** `YYYY-MM-DD` */
  reportDate: string;
  type: 'Normal' | 'Absent' | 'Revision';
  /** ISO-8601 instant. */
  submittedAt: string;
  submittedTimezone: string;
  noMemorizationToday: boolean | null;
  memoFrom: DailyReportAyahPositionRecord | null;
  memoTo: DailyReportAyahPositionRecord | null;
  /** `HH:MM` */
  memoTimeFrom: string | null;
  memoTimeTo: string | null;
  completed50Repetitions: boolean | null;
  repetitionsInSingleSession: boolean | null;
  noRevisionToday: boolean | null;
  revFrom: DailyReportAyahPositionRecord | null;
  revTo: DailyReportAyahPositionRecord | null;
  revTimeFrom: string | null;
  revTimeTo: string | null;
  readTafsir: boolean | null;
  absenceReason: 'Sick' | 'Studying' | 'Other' | null;
}

export interface IDailyReportRepository {
  /**
   * Own-scope context for API-029. Null when the caller has no Active
   * membership (→ `membership_inactive`).
   */
  findTodayContextByUserId(
    userId: string,
  ): Promise<TodayReportContextRecord | null>;

  /**
   * The live (non-soft-deleted) report of a membership for one calendar date
   * — the DB-UQ-04 key. Null when none exists.
   */
  findByMembershipAndDate(
    membershipId: string,
    reportDate: string,
  ): Promise<DailyReportRecord | null>;
}
