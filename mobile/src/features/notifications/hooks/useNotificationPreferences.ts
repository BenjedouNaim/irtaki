import { useQuery } from '@tanstack/react-query';
import {
  getNotificationPreferences,
  NotificationPreferenceDto,
} from '@/shared/api/notificationPreferences.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key for the caller's notification catalogue (API-050). Exported so
 * the mute mutation can invalidate it (TS §26 — keys declared once).
 */
export const NOTIFICATION_PREFERENCES_QUERY_KEY = [
  'notification-preferences',
  'mine',
] as const;

/**
 * Account-scoped key, so a second sign-in inside `staleTime` never reads the
 * previous account's mute state out of the cache.
 */
export function notificationPreferencesQueryKey(userId?: string | null) {
  return [
    ...NOTIFICATION_PREFERENCES_QUERY_KEY,
    userId ?? 'anonymous',
  ] as const;
}

/**
 * Feature hook for SCR-35's catalogue (F-NOT-03, API-050). Screens consume
 * hooks, never the API client directly (TS §10/§26/§37). Inherits the
 * QueryClient defaults (5m staleTime, retry 1) from RootLayout.
 */
export function useNotificationPreferences() {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<NotificationPreferenceDto[], Error>({
    queryKey: notificationPreferencesQueryKey(userId),
    queryFn: getNotificationPreferences,
  });
}
