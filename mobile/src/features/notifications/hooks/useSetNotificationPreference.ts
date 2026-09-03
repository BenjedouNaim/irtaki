import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  setNotificationPreference,
  NotificationPreferenceDto,
  SetNotificationPreferencePayload,
} from '@/shared/api/notificationPreferences.client';
import { NOTIFICATION_PREFERENCES_QUERY_KEY } from './useNotificationPreferences';

/**
 * The one query a mute affects (TS §26 — declared once, the single source of
 * truth for "what this write invalidates"): the caller's own catalogue.
 * Nothing else in the app reads mute state — dispatch does, server-side.
 */
export const SET_NOTIFICATION_PREFERENCE_INVALIDATES = [
  NOTIFICATION_PREFERENCES_QUERY_KEY,
] as const;

/**
 * Feature hook for the SCR-35 toggle (F-NOT-04, API-051). No confirmation
 * dialog — a mute is one tap either way and instantly reversible, the same
 * treatment UF §25 gives the enrollment toggle.
 *
 * Errors (including `422 ACCOUNT_CRITICAL_CATEGORY`, which the screen never
 * provokes because it renders those rows without a toggle) surface unchanged
 * for the screen to map per UF §24.
 */
export function useSetNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation<
    NotificationPreferenceDto,
    Error,
    SetNotificationPreferencePayload
  >({
    mutationFn: setNotificationPreference,
    onSettled: async () => {
      // Settled, not success: a failed write must also re-read, so a row that
      // optimistically flipped in the UI falls back to the stored state.
      await Promise.all(
        SET_NOTIFICATION_PREFERENCE_INVALIDATES.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
    },
  });
}
