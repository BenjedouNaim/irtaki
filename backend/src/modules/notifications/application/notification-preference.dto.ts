/**
 * `NotificationPreferenceDto` (TS §13) — one catalogue category merged with
 * the caller's mute state, exactly as APIS §10.12 spells it:
 * `{ category, description, is_mutable, muted }`.
 *
 * `category` is the DBT-15 code (`N-01` … `N-08`); `user_id` never appears —
 * the collection is the caller's own ("Own", APIS §6.1).
 */
export interface NotificationPreferenceDto {
  category: string;
  description: string;
  /** `false` for the account-critical categories (BR-61) — the client uses
   * it to render the row without a toggle; the server enforces VR-38 anyway. */
  is_mutable: boolean;
  /** `false` whenever no `notification_preferences` row exists (R-15). */
  muted: boolean;
}
