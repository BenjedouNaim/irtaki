import type { DailyReport } from './daily-report.entity';

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

/**
 * Keyset position for the daily-report history lists (API-031, API-032) —
 * the `{id, sort_key}` of the last item on the previous page (APIS §9.2),
 * sort key `report_date` (APIS §9.4).
 */
export interface DailyReportsCursor {
  id: string;
  sortKey: { reportDate: string };
}

/** @deprecated alias kept for API-031 callers; same shape as {@link DailyReportsCursor}. */
export type OwnDailyReportsCursor = DailyReportsCursor;

/** Filters and page window shared by both history lists (APIS §9.2, §9.3). */
export interface DailyReportsPageParams {
  /** `YYYY-MM-DD`, inclusive lower bound on `report_date`; null = unbounded. */
  from: string | null;
  /** `YYYY-MM-DD`, inclusive upper bound on `report_date`; null = unbounded. */
  to: string | null;
  /** Already clamped to [1, 100] (APIS §9.2). */
  limit: number;
  cursor: DailyReportsCursor | null;
}

export interface FindOwnDailyReportsParams extends DailyReportsPageParams {
  userId: string;
}

/**
 * API-032: the membership id that already passed the route-specific
 * ScopeGuard (TS §15.2 step 4 — "never a second, independently-trusted ID").
 */
export interface FindMembershipDailyReportsParams extends DailyReportsPageParams {
  membershipId: string;
}

export interface DailyReportPage {
  rows: DailyReportRecord[];
  hasMore: boolean;
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

  /**
   * API-031 own history: the live reports of the caller's Active membership
   * (BR-40 — a re-accepted student starts with zero history, so earlier
   * memberships never contribute), `report_date DESC, id DESC`, keyset
   * paginated on DB-IDX-01. Scope is the `memberships.user_id` join inside
   * the query (TS §15.2 repository scope filter), never a post-filter.
   * Fetches `limit + 1` rows to derive `hasMore` without a count (APIS §9.1).
   */
  findOwnHistoryByUserId(
    params: FindOwnDailyReportsParams,
  ): Promise<DailyReportPage>;

  /**
   * API-032 staff view: the live reports of ONE membership, `report_date
   * DESC, id DESC`, keyset paginated on DB-IDX-01 — the same page shape as
   * API-031. Scope is NOT re-derived here: the membership id is the one the
   * route-specific ScopeGuard already verified (TS §15.2), and the query
   * is bound to exactly that id (SA §14 NFR-19 backstop). Fetches
   * `limit + 1` rows to derive `hasMore` without a count (APIS §9.1).
   */
  findHistoryByMembershipId(
    params: FindMembershipDailyReportsParams,
  ): Promise<DailyReportPage>;

  /**
   * Persists one E-05 as a single auto-committing insert (TS §19: "single
   * insert only — not combined with the coverage update"). Ranges are stored
   * as ordinals (DBD DBT-06). A DB-UQ-04 violation is NOT translated here —
   * it propagates to the use case, which owns the 409 (TS §20).
   * Resolves with the new row's id.
   */
  create(report: DailyReport): Promise<string>;
}
