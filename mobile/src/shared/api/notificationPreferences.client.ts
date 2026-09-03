import { apiClient } from './client';

/**
 * API-050 / API-051 resource (APIS.md §10.12). One notification category
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

/** APIS.md §9.1 single-resource envelope. */
export interface NotificationPreferenceResponse {
  data: NotificationPreferenceDto;
}

/** API-051 request body (APIS.md §10.12). */
export interface SetNotificationPreferencePayload {
  category: string;
  muted: boolean;
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

/**
 * API-051 `PATCH /me/notification-preferences` — mute or unmute one
 * category. A `422 ACCOUNT_CRITICAL_CATEGORY` surfaces as an `ApiError` for
 * the caller to map; the screen never offers the toggle that would raise it.
 */
export async function setNotificationPreference(
  payload: SetNotificationPreferencePayload,
): Promise<NotificationPreferenceDto> {
  const response = await apiClient.patch<NotificationPreferenceResponse>(
    '/me/notification-preferences',
    payload,
  );
  return response.data;
}
