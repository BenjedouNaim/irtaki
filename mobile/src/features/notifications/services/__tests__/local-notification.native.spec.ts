import * as Notifications from 'expo-notifications';
import { showLocalPush } from '../local-notification.native';
import { GENERIC_PUSH_COPY } from '../../utils/push-payload';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('local-id'),
}));

const data = {
  eventType: 'N-01',
  resourceId: '019a0000-0000-7000-8000-000000000001',
};

it('displays only generic text and projected data, even when a message carries extra fields', async () => {
  await showLocalPush({ ...data, title: 'PRIVATE NAME', score: 99 });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: { ...GENERIC_PUSH_COPY, data, sound: 'default' },
    trigger: { channelId: 'irtaki' },
  });
});

it('does not schedule unknown or malformed messages', async () => {
  jest.mocked(Notifications.scheduleNotificationAsync).mockClear();
  await showLocalPush({ eventType: 'N-99', resourceId: 'malformed' });
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('suppresses the remote foreground alert so the sanitized local alert is displayed only once', async () => {
  const handler = jest.mocked(Notifications.setNotificationHandler).mock
    .calls[0][0]!;
  const remote = {
    request: { identifier: 'remote', content: {}, trigger: { type: 'push' } },
    date: 0,
  } as Notifications.Notification;
  const local = {
    request: { identifier: 'local', content: {}, trigger: null },
    date: 0,
  } as Notifications.Notification;
  expect((await handler.handleNotification(remote)).shouldShowBanner).toBe(
    false,
  );
  expect((await handler.handleNotification(local)).shouldShowBanner).toBe(true);
});
