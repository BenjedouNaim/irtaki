import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import {
  getInitialNotification,
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import { useAuthStore } from '@/shared/auth';
import { refreshAccessToken } from '@/shared/api/client';
import { getMe } from '@/shared/api/me.client';
import { listGroups } from '@/shared/api/groups.client';
import { getGroupMemberships } from '@/shared/api/memberships.client';
import { syncPushSession } from '../services/native-push-session.native';
import { showLocalPush } from '../services/local-notification.native';
import { parsePushPayload, type PushPayload } from '../utils/push-payload';
import { pushDestination } from '../utils/push-destination';
import { homeRouteForRole } from '@/navigation/roleHome';

async function resolveTeacherGroup(
  membershipId: string,
): Promise<string | null> {
  const { data: groups } = await listGroups();
  for (const group of groups) {
    const { data: roster } = await getGroupMemberships(group.id);
    if (
      roster.some(
        (entry) => entry.id === membershipId && entry.state === 'Active',
      )
    )
      return group.id;
  }
  return null;
}

export function PushNotifications() {
  const userId = useAuthStore((state) => state.userId);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const navigation = useRootNavigationState();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PushPayload | null>(null);

  useEffect(() => {
    void syncPushSession();
  }, [userId, authenticated]);

  useEffect(() => {
    const messaging = getMessaging();
    const accept = (data: unknown) => {
      const payload = parsePushPayload(data);
      if (payload) setPending(payload);
    };
    const unsubMessage = onMessage(messaging, async (message) => {
      if (useAuthStore.getState().isAuthenticated) {
        try {
          await showLocalPush(message.data);
          void queryClient.invalidateQueries();
        } catch {
          /* Permission may have been revoked while the message arrived. */
        }
      }
    });
    const unsubOpen = onNotificationOpenedApp(messaging, (message) =>
      accept(message.data),
    );
    const unsubToken = onTokenRefresh(messaging, () => {
      void syncPushSession();
    });
    void getInitialNotification(messaging)
      .then((message) => {
        if (message) accept(message.data);
      })
      .catch(() => {});
    const local = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        accept(response.notification.request.content.data);
      },
    );
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          accept(response.notification.request.content.data);
          void Notifications.clearLastNotificationResponseAsync().catch(
            () => {},
          );
        }
      })
      .catch(() => {});
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Refresh first: device upserts must not silently fail with an expired JWT.
        void refreshAccessToken()
          .then(() => syncPushSession())
          .catch(() => {});
      }
    });
    return () => {
      unsubMessage();
      unsubOpen();
      unsubToken();
      local.remove();
      foreground.remove();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!pending || !authenticated || !userId || !navigation?.key) return;
    let cancelled = false;
    void (async () => {
      try {
        // Acceptance/removal changes roles. A push never grants a role itself.
        const previousRole = useAuthStore.getState().role;
        if (!(await refreshAccessToken())) return;
        const me = await getMe();
        if (
          cancelled ||
          me.id !== userId ||
          useAuthStore.getState().userId !== userId
        )
          return;
        const session = useAuthStore.getState();
        if (me.role !== previousRole) queryClient.clear();
        else void queryClient.invalidateQueries();
        if (me.role !== session.role && session.accessToken) {
          session.setSession(session.accessToken, me.role);
        }
        const destination = await pushDestination(
          pending,
          me.role,
          resolveTeacherGroup,
        );
        if (!cancelled && useAuthStore.getState().userId === userId)
          router.replace(destination);
      } catch {
        // Stale/out-of-scope resources and network failures never expose raw errors.
        if (!cancelled && useAuthStore.getState().userId === userId)
          router.replace(homeRouteForRole(useAuthStore.getState().role));
      } finally {
        if (!cancelled) setPending(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, authenticated, userId, navigation?.key, router, queryClient]);

  return null;
}
