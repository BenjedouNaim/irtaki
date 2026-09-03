export const MEMBERSHIP_PAYMENT_SCOPE = Symbol('MEMBERSHIP_PAYMENT_SCOPE');

/**
 * Staff-scope resolution for API-047 `POST /memberships/{id}/payments`
 * (SA §14, TS §15.2: "one indexed lookup before the handler runs"). Owned
 * by Payments so its route-specific ScopeGuard never reaches into another
 * module's repository (SA §11 — Payments depends on Memberships only, and
 * reads the tables it needs through its own queries).
 */
export interface IMembershipPaymentScope {
  /**
   * True iff `membershipId` names an **Active** membership whose group is
   * assigned to `assistantId` — VR-27 ("only the Assistant of that
   * student's group may record the payment") expressed as one query.
   *
   * False for out-of-scope, non-existent and Terminated memberships alike:
   * the single query cannot and must not distinguish them (NFR-20's uniform
   * `403`, SA §14).
   */
  isActiveMembershipOfAssistant(
    membershipId: string,
    assistantId: string,
  ): Promise<boolean>;
}
