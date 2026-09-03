export const WEEKLY_REPORT_SCOPE = Symbol('WEEKLY_REPORT_SCOPE');

/**
 * Own-scope resolution for `POST /weekly-reports/{id}/confirm` (API-034 —
 * "Own, recitation day"): the single-resource-route half of SA §14 ("Guard
 * for single-resource routes, repository-level for list routes"), resolved
 * by "one indexed lookup before the handler runs" (TS §15.2). Owned by
 * Reports so its route-specific ScopeGuard never reaches into another
 * module's repository (SA §11 — Reports depends on no module).
 */
export interface IWeeklyReportScope {
  /**
   * True iff `reportId` names a live (`deleted_at IS NULL`) weekly report of
   * a membership held by `userId`. False for another student's report, a
   * non-existent id and a soft-deleted (terminated-membership) row alike —
   * the single query cannot and must not distinguish them (NFR-20 uniform
   * 403).
   */
  isOwnedByStudent(reportId: string, userId: string): Promise<boolean>;
}
