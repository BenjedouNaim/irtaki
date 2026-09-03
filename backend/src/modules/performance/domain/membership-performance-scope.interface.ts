export const MEMBERSHIP_PERFORMANCE_SCOPE = Symbol(
  'MEMBERSHIP_PERFORMANCE_SCOPE',
);

/**
 * Scope resolution for API-039 `GET /memberships/{id}/performance` — the
 * route TS §15.2 names in its own ScopeGuard row ("verifies the membership's
 * group is staffed by the caller before the handler executes").
 *
 * Owned by Performance so its route-specific ScopeGuard never reaches into
 * another module's repository (SA §11, SA §14) — the same shape Reports
 * uses for its `/memberships/{id}/…` routes (`IMembershipReportScope`) and
 * Performance already uses for `/groups/{id}/…` (`IGroupPerformanceScope`).
 *
 * Two predicates, because APIS §6.1 grants this row to two different kinds
 * of caller: `✓ all` / `✓ (g)` for staff and `✓ own` for the Student — the
 * only `/memberships/{id}/…` route a Student may call at all.
 */
export interface IMembershipPerformanceScope {
  /**
   * True iff `membershipId` names an Active membership of a group whose
   * `teacher_id` is `teacherId`. False for out-of-scope, non-existent and
   * Terminated memberships alike — the single query cannot and must not
   * distinguish them (NFR-20 uniform 403).
   */
  isActiveMembershipOfTeacher(
    membershipId: string,
    teacherId: string,
  ): Promise<boolean>;

  /**
   * True iff `membershipId` names the caller's OWN Active membership —
   * APIS §6.1's `✓ own` for the Student column. False for another
   * student's membership, a non-existent id and the caller's own
   * Terminated membership alike (NFR-20); a Student with no Active
   * membership has no performance to read, exactly as on API-037.
   */
  isOwnActiveMembership(membershipId: string, userId: string): Promise<boolean>;
}
