import { apiClient } from './client';

/**
 * API-050 resource (APIS.md §10.12). One notification category
 * merged with the caller's mute state.
 *
 * `category` is the DBT-15 code (`N-01` … `N-08`, SAS §22.2). `is_mutable`
 * is `false` for the three account-critical events (BR-61) — the screen
 * renders those without a toggle, and the server refuses to mute them
 * whatever the client sends (VR-38), so this flag is a rendering hint, never
 * the control.
 *
 * `muted` is `false` for a category with no stored preference row
 * (R-15 "absent = unmuted"), resolved server-side.
 */
export interface NotificationPreferenceDto {
  category: string;
  description: string;
  is_mutable: boolean;
  muted: boolean;
}

/** APIS.md §9.1 bounded collection envelope — no `pagination` keys. */
export interface NotificationPreferencesResponse {
  data: NotificationPreferenceDto[];
}

/**
 * API-050 `GET /me/notification-preferences` — the caller's full category
 * catalogue. Unwraps the APIS.md §9.1 envelope.
 */
export async function getNotificationPreferences(): Promise<
  NotificationPreferenceDto[]
> {
  const response = await apiClient.get<NotificationPreferencesResponse>(
    '/me/notification-preferences',
  );
  return response.data;
}
