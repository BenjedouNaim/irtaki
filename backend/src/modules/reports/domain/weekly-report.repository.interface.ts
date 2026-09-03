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

export interface IWeeklyReportRepository {
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
}
