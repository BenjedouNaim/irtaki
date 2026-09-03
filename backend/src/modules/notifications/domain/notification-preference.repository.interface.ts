import type { NotificationCategory } from './notification-preference.entity';

export const NOTIFICATION_PREFERENCE_REPOSITORY = Symbol(
  'NOTIFICATION_PREFERENCE_REPOSITORY',
);

/**
 * One catalogue row already merged with the caller's stored preference —
 * the shape API-050 returns (APIS §10.12 / APIQ-10). `muted` is `false`
 * whenever `notification_preferences` holds no row for the pair, which is
 * R-15's "absent = unmuted" resolved in the query, not in the use case.
 */
export interface NotificationPreferenceRecord extends NotificationCategory {
  muted: boolean;
}

export interface INotificationPreferenceRepository {
  /**
   * APIQ-10: the FULL `notification_categories` catalogue left-joined onto
   * the caller's `notification_preferences` rows, in one parameterised
   * indexed query (TS §15.2, TS §36) — never the stored rows post-filtered
   * or merged in application code.
   */
  findCatalogForUser(userId: string): Promise<NotificationPreferenceRecord[]>;
}
