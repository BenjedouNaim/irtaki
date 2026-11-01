import * as Notifications from 'expo-notifications';
import { GENERIC_PUSH_COPY, parsePushPayload } from '../utils/push-payload';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // FCM foreground handling creates one sanitized local notification below.
    const trigger = notification.request.trigger;
    const local = !trigger || !('type' in trigger) || trigger.type !== 'push';
    return {
      shouldShowBanner: local,
      shouldShowList: local,
      shouldPlaySound: local,
      shouldSetBadge: false,
    };
  },
});

export async function showLocalPush(data: unknown): Promise<void> {
  const payload = parsePushPayload(data);
  if (!payload) return;
  await Notifications.scheduleNotificationAsync({
    content: { ...GENERIC_PUSH_COPY, data: { ...payload }, sound: 'default' },
    trigger: { channelId: 'irtaki' },
  });
}
