export const MEMBERSHIP_REPORT_SCOPE = Symbol('MEMBERSHIP_REPORT_SCOPE');

/**
 * Staff-scope resolution for the Reports module's `/memberships/{id}/…`
 * routes (SA §14, TS §15.2): "one indexed lookup before the handler runs".
 * Owned by Reports so that its route-specific ScopeGuard never reaches into
 * another module's repository (SA §11 — Reports depends on no module).
 */
export interface IMembershipReportScope {
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
}
