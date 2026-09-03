export const DEVICE_TOKEN_SCOPE = Symbol('DEVICE_TOKEN_SCOPE');

/**
 * Own-scope resolution for `DELETE /devices/{id}` (API-049 — "Own"): the
 * single-resource-route half of SA §14 ("Guard for single-resource routes,
 * repository-level for list routes"), resolved by "one indexed lookup
 * before the handler runs" (TS §15.2). Owned by Notifications so its
 * route-specific ScopeGuard never reaches into another module (SA §11).
 */
export interface IDeviceTokenScope {
  /**
   * True iff `deviceId` names a `device_tokens` row whose `user_id` is the
   * caller. False for another user's device and for a non-existent id
   * alike — the single query cannot and must not distinguish them (SA §14 /
   * NFR-20 uniform 403).
   */
  isOwnedByCaller(deviceId: string, userId: string): Promise<boolean>;
}
