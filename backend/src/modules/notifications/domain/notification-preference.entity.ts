import { AccountCriticalCategoryError } from './notification-preference.errors';

/**
 * One `notification_categories` row (DBT-15) as the domain reads it. The
 * category is the one enumeration this schema promoted to a lookup table
 * (DBD §18) precisely because `is_mutable` is a per-value BUSINESS attribute
 * (BR-61), not a valid-value list — so the domain takes the row, never a
 * hard-coded list of codes.
 */
export interface NotificationCategory {
  /** `N-01` … `N-08` (SAS §22.2, DEC-D03). */
  code: string;
  description: string;
  /** `false` for the account-critical categories N-03 / N-04 / N-08. */
  isMutable: boolean;
}

/** What a caller may supply to `PATCH /me/notification-preferences`. */
export interface SetNotificationPreferenceProps {
  /** The authenticated caller — never taken from the request body. */
  userId: string;
  /** Resolved from `notification_categories`, not from client input. */
  category: NotificationCategory;
  muted: boolean;
}

/**
 * E-10 NotificationPreference (DMS §7 / SAS §20, supporting subdomain): one
 * User's mute state for one category. `(user_id, category)` is its natural
 * key (DB-UQ-10) and the lifecycle is "created → mutable at will" (DMS §7),
 * so a preference is a value, not a stateful aggregate.
 *
 * The single invariant is BR-61 / VR-38: an account-critical category can
 * never be muted. This factory rejects EVERY write to a category whose
 * `is_mutable` is `false`, not only `muted = true`:
 *
 * - BR-61 and DB-CHK-09 forbid the `muted = true` half;
 * - `muted = false` on such a category is the state R-15 already gives it
 *   for free ("absent = unmuted"), so persisting it asserts nothing and
 *   APIS §10.12 states the endpoint's answer for that category flatly —
 *   `422 ACCOUNT_CRITICAL_CATEGORY` "if is_mutable=false for that category",
 *   with no condition on the requested value.
 *
 * Framework-free (TS §9). Instances are frozen.
 */
export class NotificationPreference {
  private constructor(
    public readonly userId: string,
    public readonly category: string,
    public readonly muted: boolean,
  ) {
    Object.freeze(this);
  }

  static set(props: SetNotificationPreferenceProps): NotificationPreference {
    if (!props.category.isMutable) {
      throw new AccountCriticalCategoryError(props.category.code);
    }

    return new NotificationPreference(
      props.userId,
      props.category.code,
      props.muted,
    );
  }
}
