export const MEMBERSHIP_PERFORMANCE_REPOSITORY = Symbol(
  'MEMBERSHIP_PERFORMANCE_REPOSITORY',
);

/**
 * Everything DS-03 needs about ONE membership, resolved by a single indexed
 * lookup. Null when the id names no membership — the Admin path's `404`
 * (APIS §9.6), since the Admin bypasses the ScopeGuard (DEC-C07) while a
 * Teacher's or a Student's non-existent id was already masked as `403`
 * upstream (NFR-20).
 *
 * The three window bounds feed `EffectiveWindow(m)` (SAS §18.1), and
 * `timezone` is the STUDENT's own — API-039 is a single-student view, so
 * "today" is that student's day boundary (T-01, INV-27), exactly as on
 * API-037, never the reading Teacher's.
 */
export interface MembershipPerformanceContextRecord {
  membershipId: string;
  /** `groups.recitation_day`, ISO day-of-week 1..7 — BR-15's week anchor. */
  recitationDay: number;
  /** `groups.archived_at` as an ISO-8601 instant, null while Active. */
  archivedAt: string | null;
  /** `memberships.started_at`, `YYYY-MM-DD`. */
  startedAt: string;
  /** `memberships.ended_at`, `YYYY-MM-DD`; null while Active. */
  endedAt: string | null;
  /** `users.timezone` of the membership holder (T-01, INV-27). */
  timezone: string;
}

/**
 * API-039's own read, owned by the Performance module (APIS §12 UC-08 —
 * the same `memberships` / `daily_reports` / `weekly_reports` access it
 * attributes to UC-07). One literal parameterised statement over the
 * `memberships` primary key (TS §36, SA §20), auto-committing, with no
 * locking and no elevated isolation (TS §19, §20).
 *
 * The per-membership report reads themselves are NOT restated here: the
 * membership-scoped `findDaySnapshotsByMembershipAndRange`,
 * `findLastReportDateByMembershipId` and `countAttendedFinalisedWeeks` that
 * API-037 already uses take a membership id and are reused verbatim — the
 * whole point of F-PERF-03 being "DS-03 with a caller-supplied
 * membership_id instead of own".
 */
export interface IMembershipPerformanceRepository {
  findContext(
    membershipId: string,
  ): Promise<MembershipPerformanceContextRecord | null>;
}
