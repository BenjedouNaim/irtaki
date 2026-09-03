export const GROUP_PAYMENT_SCOPE = Symbol('GROUP_PAYMENT_SCOPE');

/**
 * Staff-scope resolution for API-046 `GET /groups/{id}/payments` (SA §14,
 * TS §15.2: "one indexed lookup before the handler runs"). Owned by
 * Payments so its route-specific ScopeGuard never reaches into another
 * module's repository (SA §11 — Payments depends on Memberships only, and
 * reads the tables it needs through its own queries).
 */
export interface IGroupPaymentScope {
  /**
   * True iff `groupId` names a group whose `assistant_id` is `assistantId`.
   * False for out-of-scope and non-existent groups alike — the single query
   * cannot and must not distinguish them (NFR-20 uniform 403). Archived
   * groups stay in scope: FR-PAY-12 stops cycle *generation* at
   * `archived_at`, it does not withdraw the ledger (EC-57 — "existing
   * arrears remain visible").
   */
  isGroupOfAssistant(groupId: string, assistantId: string): Promise<boolean>;

  /**
   * True iff a group row with this id exists. Serves the Admin path only in
   * practice: the Admin bypasses the ScopeGuard (DEC-C07), so "genuinely
   * doesn't exist" (APIS §9.6 `404`) has to be established after the guard.
   */
  groupExists(groupId: string): Promise<boolean>;
}
