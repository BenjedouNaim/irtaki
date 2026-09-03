import type { WeeklyMetrics } from './weekly-metrics-calculator';

export const WEEKLY_REPORT_REPOSITORY = Symbol('WEEKLY_REPORT_REPOSITORY');

/** DMS §9 `WeeklyReportState` — `Open` → `Finalised`, one-way (ST-06). */
export type WeeklyReportState = 'Open' | 'Finalised';

/**
 * Everything API-033 needs for the caller's Active membership, resolved by
 * ONE indexed lookup (TS §15.2) joined on `memberships`
 * (`user_id = :caller AND state = 'Active'`), `groups` and `users` —
 * scope is applied in the query, never post-filtered. The three window
 * bounds feed `EffectiveWindow(m)` (SAS §18.1).
 */
export interface CurrentWeekContextRecord {
  membershipId: string;
  groupId: string;
  /** `groups.lifecycle_state` — `Active` | `Archived`. */
  groupLifecycleState: string;
  /** `groups.recitation_day`, ISO day-of-week 1..7. */
  recitationDay: number;
  /** `groups.archived_at` as an ISO-8601 instant, null while Active. */
  archivedAt: string | null;
  /** `memberships.started_at`, `YYYY-MM-DD`. */
  startedAt: string;
  /** `memberships.ended_at`, `YYYY-MM-DD`; null while Active. */
  endedAt: string | null;
  /** `users.timezone` — the day-boundary authority (T-01, INV-27). */
  timezone: string;
}

/** One live `weekly_reports` row (DBT-07). */
export interface WeeklyReportRecord {
  id: string;
  membershipId: string;
  /** `YYYY-MM-DD` */
  weekStart: string;
  /** `YYYY-MM-DD` — the recitation-day date. */
  weekEnd: string;
  expectedDays: number;
  missedDailyReports: number;
  missedDailyMemorization: number;
  missedDailyRevision: number;
  missed50Repetitions: number;
  missedSingleSession: number;
  attendedRecitationCall: boolean;
  state: WeeklyReportState;
  /** ISO-8601 instant, null while Open. */
  finalisedAt: string | null;
  /** `users.id` of the confirming Student; null = not yet / scheduler default. */
  finalisedBy: string | null;
}

/**
 * The E-06 row the system creates on entering the recitation day, or
 * lazily on first read that day (DBD §14, ST-06 "→ Open"): the five
 * `missed_*` metrics and `expected_days` are computed once, at creation
 * (WeeklyMetricsCalculator), and stored NOT NULL; `attended` defaults to
 * `false` (FR-WR-06) and `state` to `Open`.
 */
export interface NewWeeklyReport {
  membershipId: string;
  weekStart: string;
  weekEnd: string;
  metrics: Pick<
    WeeklyMetrics,
    | 'expectedDays'
    | 'missedDailyReports'
    | 'missedDailyMemorization'
    | 'missedDailyRevision'
    | 'missed50Repetitions'
    | 'missedSingleSession'
  >;
}

/**
 * A live `weekly_reports` row joined to `users.timezone` of the membership
 * holder — the day-boundary authority every ST-06 guard evaluates against
 * (T-01, INV-27). Served to API-034 (own scope) and to DS-02 (all Open rows).
 */
export interface WeeklyReportWithTimezoneRecord extends WeeklyReportRecord {
  timezone: string;
}

/**
 * Keyset position for the weekly-report history lists (API-035, API-036) —
 * the `{id, sort_key}` of the last item on the previous page (APIS §9.2),
 * sort key `week_start` (APIS §9.4).
 */
export interface WeeklyReportsCursor {
  id: string;
  sortKey: { weekStart: string };
}

/** Filters and page window shared by both weekly history lists (APIS §9.2, §9.3). */
export interface WeeklyReportsPageParams {
  /** `YYYY-MM-DD`, inclusive lower bound on `week_start`; null = unbounded. */
  from: string | null;
  /** `YYYY-MM-DD`, inclusive upper bound on `week_start`; null = unbounded. */
  to: string | null;
  /** Already clamped to [1, 100] (APIS §9.2). */
  limit: number;
  cursor: WeeklyReportsCursor | null;
}

export interface FindOwnWeeklyReportsParams extends WeeklyReportsPageParams {
  userId: string;
}

/**
 * API-036: the membership id that already passed the route-specific
 * ScopeGuard (TS §15.2 step 4 — "never a second, independently-trusted ID").
 */
export interface FindMembershipWeeklyReportsParams extends WeeklyReportsPageParams {
  membershipId: string;
}

export interface WeeklyReportPage {
  rows: WeeklyReportRecord[];
  hasMore: boolean;
}

export interface IWeeklyReportRepository {
  /**
   * API-035 own history: the live `Finalised` rows of the caller's Active
   * membership (BR-40 — a re-accepted student starts with zero history, so
   * earlier memberships never contribute; UF §16/§34 — a week enters the
   * History once finalised, the Open recitation-day row is SCR-12's),
   * `week_start DESC, id DESC`, keyset paginated on DB-IDX-02. Scope is the
   * `memberships.user_id` join inside the query (TS §15.2 repository scope
   * filter), never a post-filter. Fetches `limit + 1` rows to derive
   * `hasMore` without a count (APIS §9.1).
   */
  findOwnHistoryByUserId(
    params: FindOwnWeeklyReportsParams,
  ): Promise<WeeklyReportPage>;

  /**
   * API-036 staff view: the live `Finalised` rows of ONE membership,
   * `week_start DESC, id DESC`, keyset paginated on DB-IDX-02 — the same
   * page shape and the same finalised-only rule as API-035. Scope is NOT
   * re-derived here: the membership id is the one the route-specific
   * ScopeGuard already verified (TS §15.2), and the query is bound to
   * exactly that id (SA §14 NFR-19 backstop). Fetches `limit + 1` rows to
   * derive `hasMore` without a count (APIS §9.1).
   */
  findHistoryByMembershipId(
    params: FindMembershipWeeklyReportsParams,
  ): Promise<WeeklyReportPage>;
  /**
   * Own-scope context for API-033. Null when the caller has no Active
   * membership.
   */
  findCurrentWeekContextByUserId(
    userId: string,
  ): Promise<CurrentWeekContextRecord | null>;

  /**
   * The live row of a membership for one reporting week — the DB-UQ-05 key
   * `(membership_id, week_start) WHERE deleted_at IS NULL`. Null when none.
   */
  findByMembershipAndWeekStart(
    membershipId: string,
    weekStart: string,
  ): Promise<WeeklyReportRecord | null>;

  /**
   * Lazy creation on the recitation day (DBD §14, DBQ-01): one INSERT that
   * lets DB-UQ-05 settle a concurrent first read (TS §20 "attempt the
   * write, let the constraint reject it") and resolves with the row that
   * exists afterwards — the one just inserted, or the one the concurrent
   * read created first. Single auto-committed statement pair (TS §19).
   */
  createIfAbsent(report: NewWeeklyReport): Promise<WeeklyReportRecord>;

  /**
   * Own-scope read for API-034 — the NFR-19 repository backstop behind the
   * route's ScopeGuard: ONE indexed primary-key lookup joined on
   * `memberships` (`user_id = :caller`) and `users` (timezone). Null for
   * another student's report, a non-existent id and a soft-deleted row
   * alike (NFR-20).
   */
  findOwnById(
    reportId: string,
    userId: string,
  ): Promise<WeeklyReportWithTimezoneRecord | null>;

  /**
   * Student path of ST-06 `Open → Finalised` (UC-06 step 7): one UPDATE
   * guarded by `state = 'Open'` — "attempt the write, let the constraint
   * reject it" (TS §20) — setting `attended_recitation_call`, `state`,
   * `finalised_at` and `finalised_by` (the four columns DB-CHK-08 leaves
   * mutable while Open). Single auto-committed statement (TS §19). Resolves
   * null when zero rows matched: already `Finalised` (VR-36), by a double
   * confirm or by the scheduler.
   */
  finaliseByStudent(input: {
    reportId: string;
    attendedRecitationCall: boolean;
    finalisedBy: string;
    finalisedAt: Date;
  }): Promise<WeeklyReportRecord | null>;

  /**
   * `AttendanceRate`'s numerator (SAS §18.3): how many live `Finalised`
   * weekly reports of ONE membership, whose `week_start` falls inside the
   * inclusive range, carry `attended_recitation_call = true`. One DB-IDX-02
   * range scan (DBD §26 lists this index for exactly this figure). The
   * denominator is `|W(P)|`, a count of reporting weeks, never of rows —
   * so a week with no row simply has no attendance to its credit.
   */
  countAttendedFinalisedWeeks(
    membershipId: string,
    fromWeekStart: string,
    toWeekStart: string,
  ): Promise<number>;

  /**
   * Every live `Open` row with its holder's timezone — DS-02's candidate
   * set. Bounded by construction: a row exists only from the recitation day
   * on (DBQ-01), so at most one Open row per membership at any time.
   */
  findAllOpenWithTimezone(): Promise<WeeklyReportWithTimezoneRecord[]>;

  /**
   * Scheduler path of ST-06 (FR-WR-06, AC-12): one UPDATE over the given
   * ids, guarded by `state = 'Open'` so a student who confirmed in the
   * meantime wins and a re-run rewrites nothing (VR-36, AR-17, EC-40).
   * Sets `attended_recitation_call = false`, `state = 'Finalised'`,
   * `finalised_at = :now`, `finalised_by = NULL` (DBD §14: NULL = scheduler
   * default). Resolves with the rows actually finalised by this call.
   */
  finaliseAsScheduler(
    reportIds: readonly string[],
    finalisedAt: Date,
  ): Promise<WeeklyReportRecord[]>;
}
