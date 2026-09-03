/**
 * The DEC-D03 event catalogue of SAS §22.2 — the eight, and only eight,
 * notifications this system sends (AGENTS §13: "any notification beyond the
 * 8 named events" is out of scope).
 *
 * Each id doubles as the `notification_categories.code` (DBT-15, DBD §18:
 * the one enumeration promoted to a lookup table) which the preference and
 * log rows are keyed on — which is why SA §21's `dispatch(event, recipient,
 * category)` takes the pair: `event` is the occurrence, `category` is the
 * catalogue row it is filed under, and in this catalogue they coincide.
 *
 * Framework-free (TS §9).
 */
export const NOTIFICATION_EVENT_TYPES = [
  'N-01',
  'N-02',
  'N-03',
  'N-04',
  'N-05',
  'N-06',
  'N-07',
  'N-08',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/**
 * The three account-critical categories (FR-NOTIF-06, BR-61): join-request
 * acceptance, join-request rejection and group removal. Listed here only to
 * name them in code; the authority at dispatch time is
 * `notification_categories.is_mutable`, read from the row — never a
 * hard-coded list (the very reason DBD §18 promoted the enum to a table).
 */
export const ACCOUNT_CRITICAL_EVENT_TYPES: readonly NotificationEventType[] = [
  'N-03',
  'N-04',
  'N-08',
];

export function isNotificationEventType(
  value: string,
): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}
