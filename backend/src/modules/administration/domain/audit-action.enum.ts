/**
 * DMS §20 `AuditAction` — the only three actions that are ever audited
 * (DEC-D05, confirmed by SAS §21) and therefore the only three values
 * `audit_entries.action` may carry (DBD DBT-18 `CHECK`).
 *
 * APIS §9.9 states the write points: `LOGIN` on `/auth/login` and
 * `/auth/register`, `GROUP_CREATED` on `POST /groups`, `ENROLLMENT_TOGGLED`
 * on `PATCH /groups/{id}/enrollment`. Nothing else writes here and nothing
 * else is read back through API-054 — the gap is a documented decision
 * (RISK-08), not an oversight, and widening it needs a SAS-level change to
 * DEC-D05 first.
 */
export enum AuditAction {
  Login = 'LOGIN',
  GroupCreated = 'GROUP_CREATED',
  EnrollmentToggled = 'ENROLLMENT_TOGGLED',
}

/** The three values, in the order APIS §9.9 lists them. */
export const AUDITED_ACTIONS: readonly AuditAction[] = [
  AuditAction.Login,
  AuditAction.GroupCreated,
  AuditAction.EnrollmentToggled,
] as const;

export function isAuditAction(value: unknown): value is AuditAction {
  return (
    typeof value === 'string' &&
    (AUDITED_ACTIONS as readonly string[]).includes(value)
  );
}
