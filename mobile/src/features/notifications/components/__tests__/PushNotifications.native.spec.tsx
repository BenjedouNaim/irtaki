import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { PushNotifications } from '../PushNotifications.native';
import { useAuthStore } from '@/shared/auth';
import { refreshAccessToken } from '@/shared/api/client';
import { getMe } from '@/shared/api/me.client';
import { showLocalPush } from '../../services/local-notification.native';
import {
  onMessage,
  onNotificationOpenedApp,
} from '@react-native-firebase/messaging';

const mockReplace = jest.fn();
const mockClear = jest.fn();
const mockRouter = { replace: mockReplace };
const mockQueryClient = {
  clear: mockClear,
  invalidateQueries: jest.fn().mockResolvedValue(undefined),
};
const mockNavigation = { key: 'ready' };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => mockNavigation,
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn().mockReturnValue({}),
  onMessage: jest.fn().mockReturnValue(jest.fn()),
  onNotificationOpenedApp: jest.fn().mockReturnValue(jest.fn()),
  onTokenRefresh: jest.fn().mockReturnValue(jest.fn()),
  getInitialNotification: jest.fn().mockResolvedValue(null),
}));
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest
    .fn()
    .mockReturnValue({ remove: jest.fn() }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/native-push-session.native', () => ({
  syncPushSession: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/local-notification.native', () => ({
  showLocalPush: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/shared/api/client', () => ({ refreshAccessToken: jest.fn() }));
jest.mock('@/shared/api/me.client', () => ({ getMe: jest.fn() }));
jest.mock('@/shared/api/groups.client', () => ({ listGroups: jest.fn() }));
jest.mock('@/shared/api/memberships.client', () => ({
  getGroupMemberships: jest.fn(),
}));

const data = {
  eventType: 'N-03',
  resourceId: '019a0000-0000-7000-8000-000000000001',
};
const accessToken = `e30.${Buffer.from(JSON.stringify({ sub: 'user-1', role: 'Student' })).toString('base64url')}.signature`;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    userId: 'user-1',
    accessToken,
    role: 'User',
    isAuthenticated: true,
    isLoading: false,
  });
  jest.mocked(refreshAccessToken).mockResolvedValue(accessToken);
  jest.mocked(getMe).mockResolvedValue({
    id: 'user-1',
    role: 'Student',
    email: 'test@example.test',
    full_name: null,
    gender: null,
    timezone: 'Africa/Tunis',
  });
});

it('creates a local foreground notification for a signed-in user', async () => {
  render(<PushNotifications />);
  const handler = jest.mocked(onMessage).mock.calls[0][1];
  await act(async () => {
    await handler({ data, fcmOptions: {} });
  });
  expect(showLocalPush).toHaveBeenCalledWith(data);
});

it('does not display a foreground message after sign-out', async () => {
  useAuthStore.setState({
    userId: null,
    accessToken: null,
    role: null,
    isAuthenticated: false,
  });
  render(<PushNotifications />);
  const handler = jest.mocked(onMessage).mock.calls[0][1];
  await act(async () => {
    await handler({ data, fcmOptions: {} });
  });
  expect(showLocalPush).not.toHaveBeenCalled();
});

it('refreshes the session and trusts the server role before routing an acceptance', async () => {
  render(<PushNotifications />);
  const handler = jest.mocked(onNotificationOpenedApp).mock.calls[0][1];
  act(() => {
    handler({ data, fcmOptions: {} });
  });
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith('/(app)/student'),
  );
  expect(refreshAccessToken).toHaveBeenCalled();
  expect(mockClear).toHaveBeenCalled();
  expect(useAuthStore.getState().role).toBe('Student');
});

it('does not navigate when the account changes while a tap is being resolved', async () => {
  let finish!: (value: Awaited<ReturnType<typeof getMe>>) => void;
  jest.mocked(getMe).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<PushNotifications />);
  const handler = jest.mocked(onNotificationOpenedApp).mock.calls[0][1];
  act(() => {
    handler({ data, fcmOptions: {} });
  });
  await waitFor(() => expect(getMe).toHaveBeenCalled());
  await act(async () => {
    useAuthStore.setState({ userId: 'other-user' });
    finish({
      id: 'user-1',
      role: 'Student',
      email: 'test@example.test',
      full_name: null,
      gender: null,
      timezone: 'Africa/Tunis',
    });
  });
  expect(mockReplace).not.toHaveBeenCalled();
});
