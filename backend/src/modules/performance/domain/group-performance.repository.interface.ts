import type { DatedDailyReportSnapshot } from '../../reports/domain/weekly-metrics-calculator';
import type { GroupMemberWindow } from './group-member-set';

export const GROUP_PERFORMANCE_REPOSITORY = Symbol(
  'GROUP_PERFORMANCE_REPOSITORY',
);

/**
 * Everything the group dashboard needs about the group itself and the actor
 * asking, resolved by ONE indexed lookup. Null when the group id names no
 * row — the Admin path's `404` (APIS §9.6), since the Admin bypasses the
 * ScopeGuard (DEC-C07) and a Teacher's non-existent id was already masked
 * as `403` upstream (NFR-20).
 */
export interface GroupPerformanceContextRecord {
  /** `groups.recitation_day`, ISO day-of-week 1..7 — BR-15's week anchor. */
  recitationDay: number;
  /** `groups.archived_at` as an ISO-8601 instant, null while Active. */
  archivedAt: string | null;
  /**
   * `users.timezone` of the caller — the day-boundary authority for the
   * ONE date the group-level `?period=` window is measured from (T-01
   * applied to the only User the period selection involves; SAS §19 lists
   * the group dashboard as a group-level view whose date-keyed aggregate
   * per-student timezones cannot desynchronise).
   */
  callerTimezone: string;
}

/** One row of the group's member set, with everything DS-03 needs per member. */
export interface GroupMemberRecord extends GroupMemberWindow {
  /** `users.full_name`; nullable exactly as the column is. */
  fullName: string | null;
  /** `users.timezone` — this member's own day-boundary authority (T-01). */
  timezone: string;
}

/**
 * SAS §20.2's soft-delete query scope, chosen per request rather than
 * applied globally: the section's own warning is that the Teacher "sees a
 * removed student in a _historical_ period and not in the _current_ week",
 * and that this "must be implemented as a **period-aware** filter, not a
 * global one".
 *
 * - `live` — soft-deleted rows are hidden (every ordinary read, and the
 *   FR-PERF-10 current-week view);
 * - `historical` — soft-deleted rows are included, the FR-PERF-09/DEC-C04
 *   exception, so a removed student's own reports still feed the aggregate
 *   for the portion of the period their Membership was active.
 */
export type SoftDeleteVisibility = 'live' | 'historical';

/** A day snapshot carrying the membership it belongs to (bulk read). */
export interface MemberDaySnapshot extends DatedDailyReportSnapshot {
  membershipId: string;
}

/** One live, Finalised, attended weekly report — AttendanceRate's numerator. */
export interface MemberAttendedWeek {
  membershipId: string;
  /** `weekly_reports.week_start`, `YYYY-MM-DD`. */
  weekStart: string;
}

/**
 * The Performance module's own reads for API-038 (APIS §12 UC-07: the
 * Performance module "reads `memberships`, `daily_reports`,
 * `weekly_reports`"). Every method is a single literal parameterised
 * statement over a DBD §23 index (TS §36, SA §20) — no row locking, no
 * elevated isolation, no transaction (TS §19/§20).
 */
export interface IGroupPerformanceRepository {
  /** The group's week anchor and archival bound, plus the caller's timezone. */
  findContext(
    groupId: string,
    callerId: string,
  ): Promise<GroupPerformanceContextRecord | null>;

  /**
   * FR-PERF-10's member set: the group's **Active** memberships only, for
   * the current-week view. One DB-IDX-03 `(group_id, state)` scan.
   */
  findActiveMembers(groupId: string): Promise<GroupMemberRecord[]>;

  /**
   * FR-PERF-09's member set: every membership of the group — Active and
   * Terminated alike — whose active window intersects `[from, to]`. One
   * DB-IDX-04 `(group_id, started_at, ended_at)` scan, the index DBD §26
   * names for exactly this ("Period-aware historical aggregation").
   */
  findMembersIntersecting(
    groupId: string,
    from: string,
    to: string,
  ): Promise<GroupMemberRecord[]>;

  /**
   * The VO-09 classification inputs of every report of the given memberships
   * dated within `[from, to]` — one DB-IDX-01 range walk per membership
   * inside a single statement. Ordinals never leave the query.
   *
   * `visibility` is SAS §20.2's period-aware soft-delete scope, NOT a global
   * one: `'live'` hides the soft-deleted rows (the current-week view —
   * "Teacher, current-week and at-risk views: No"), `'historical'` reveals
   * them (the FR-PERF-09/DEC-C04 exception — "Teacher, historical group
   * aggregates: **Yes**, but only for the period the membership was
   * active"). The "only for the period" half is the caller's
   * `EffectiveWindow(m)`, which never reaches past `ended_at`.
   */
  findDaySnapshots(
    membershipIds: readonly string[],
    from: string,
    to: string,
    visibility: SoftDeleteVisibility,
  ): Promise<MemberDaySnapshot[]>;

  /**
   * The `Finalised` weekly reports of the given memberships with
   * `attended_recitation_call = true` whose `week_start` falls inside
   * `[fromWeekStart, toWeekStart]` — one DB-IDX-02 range scan. Rows, not a
   * count, because each member's `W(P)` ends at their own effective window
   * (SAS §18.3) and the caller pairs them off per member.
   *
   * `visibility` carries the same SAS §20.2 period-aware exception as
   * `findDaySnapshots`: a removed student's finalised weeks are soft-deleted
   * by the termination cascade and must still feed a historical aggregate.
   */
  findAttendedWeeks(
    membershipIds: readonly string[],
    fromWeekStart: string,
    toWeekStart: string,
    visibility: SoftDeleteVisibility,
  ): Promise<MemberAttendedWeek[]>;
}
