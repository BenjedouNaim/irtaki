import type { PerformancePeriod } from './performance-period';

/**
 * One candidate member of a group for the period under aggregation — the
 * `memberships` columns FR-PERF-09 reasons about, nothing more.
 */
export interface GroupMemberWindow {
  membershipId: string;
  /** `memberships.state` — `Active` while enrolled, `Terminated` once removed. */
  state: 'Active' | 'Terminated';
  /** `memberships.started_at`, `YYYY-MM-DD`. */
  startedAt: string;
  /** `memberships.ended_at`, `YYYY-MM-DD`; null while Active. */
  endedAt: string | null;
}

export interface SelectGroupMemberSetInput<T extends GroupMemberWindow> {
  members: readonly T[];
  /** SAS §18.3's period `P`, already resolved from `?period=`. */
  period: PerformancePeriod;
  /**
   * True when `P` IS the current reporting week — the FR-PERF-10 exception
   * (APIS §10.9: "except when `period` resolves to the current week").
   */
  isCurrentWeek: boolean;
}

/**
 * "A Membership's active window intersects `P`" — the FR-PERF-09 predicate.
 * The window is `[started_at, ended_at ?? ∞]`; an Active membership has no
 * upper bound. ISO `YYYY-MM-DD` strings order lexicographically, so `<=` is
 * date order.
 */
export function activeWindowIntersects(
  member: GroupMemberWindow,
  period: PerformancePeriod,
): boolean {
  return (
    member.startedAt <= period.to &&
    (member.endedAt === null || member.endedAt >= period.from)
  );
}

/**
 * UC-07 steps 3 and 6 — the member set of a group dashboard, and the ONE
 * rule this feature exists to get right:
 *
 * - **FR-PERF-09 / DEC-C04** (historical periods): every Membership whose
 *   active window intersects `P`, **including Terminated ones**, "for the
 *   portion of the period during which their Membership was active". The
 *   proration itself is `EffectiveWindow(m)`'s job downstream (SAS §18.1);
 *   this function only decides who is in.
 * - **FR-PERF-10** (the current-week view): Terminated memberships are
 *   excluded **entirely**, whatever their window says — "no user-facing
 *   surface exposes the terminated data" while the week is live (SAS
 *   §17 postcondition, DEC-C04).
 *
 * The two branches are deliberately not merged: FR-PERF-10 is an exclusion
 * by state, not a narrower window test, so a member terminated yesterday is
 * absent from this week's view even though yesterday is inside this week.
 *
 * Pure and framework-free (TS §9).
 */
export function selectGroupMemberSet<T extends GroupMemberWindow>(
  input: SelectGroupMemberSetInput<T>,
): T[] {
  if (input.isCurrentWeek) {
    return input.members.filter((member) => member.state === 'Active');
  }
  return input.members.filter((member) =>
    activeWindowIntersects(member, input.period),
  );
}
