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
