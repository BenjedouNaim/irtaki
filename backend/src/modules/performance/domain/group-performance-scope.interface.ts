export const GROUP_PERFORMANCE_SCOPE = Symbol('GROUP_PERFORMANCE_SCOPE');

/**
 * Staff-scope resolution for the Performance module's `/groups/{id}/…`
 * routes (SA §14, TS §15.2: "one indexed lookup before the handler runs").
 * Owned by Performance so its route-specific ScopeGuard never reaches into
 * another module's repository — the same shape the Reports module uses for
 * `/memberships/{id}/…` (`IMembershipReportScope`).
 */
export interface IGroupPerformanceScope {
  /**
   * True iff `groupId` names a group whose `teacher_id` is `teacherId` —
   * SA §14's own worked query. False for an unassigned group and a
   * non-existent one alike: the single query cannot and must not
   * distinguish them (NFR-20 uniform 403, AC-17).
   */
  isGroupOfTeacher(groupId: string, teacherId: string): Promise<boolean>;
}
