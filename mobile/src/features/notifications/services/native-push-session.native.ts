import { Alert, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import {
  deleteToken,
  getMessaging,
  getToken,
  registerDeviceForRemoteMessages,
  setAutoInitEnabled,
} from '@react-native-firebase/messaging';
import { registerDevice, unregisterDevice } from '@/shared/api/devices.client';
import { useAuthStore } from '@/shared/auth';
import {
  PushRegistrationManager,
  type StoredPushRegistration,
} from './push-registration';
import { setPushCleanup } from './push-session';

const REGISTRATION_KEY = 'irtaki_push_registration';
const PRIMED_KEY = 'irtaki_push_permission_primed';

async function permission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('irtaki', {
      name: 'إشعارات ارتقِ',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    return true;
  if (!current.canAskAgain || (await SecureStore.getItemAsync(PRIMED_KEY)))
    return false;
  await SecureStore.setItemAsync(PRIMED_KEY, 'true');
  const continueToPermission = await new Promise<boolean>((resolve) => {
    Alert.alert(
      'إشعارات ارتقِ',
      'اسمح بالإشعارات لتصلك التذكيرات وتنبيهات حسابك.',
      [
        { text: 'ليس الآن', style: 'cancel', onPress: () => resolve(false) },
        { text: 'متابعة', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
  if (!continueToPermission) return false;
  const result = await Notifications.requestPermissionsAsync();
  return (
    result.granted ||
    result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export const pushRegistration = new PushRegistrationManager({
  permission,
  enable: (enabled) => setAutoInitEnabled(getMessaging(), enabled),
  token: async () => {
    const messaging = getMessaging();
    // iOS registration provides the APNs token that Firebase maps to its FCM token.
    if (
      Platform.OS === 'ios' &&
      !messaging.isDeviceRegisteredForRemoteMessages
    ) {
      await registerDeviceForRemoteMessages(messaging);
    }
    return getToken(messaging);
  },
  deleteToken: () => deleteToken(getMessaging()),
  register: (token, accessToken) =>
    registerDevice(
      token,
      Platform.OS === 'ios' ? 'iOS' : 'Android',
      accessToken,
    ),
  unregister: unregisterDevice,
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(REGISTRATION_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as StoredPushRegistration;
      return typeof value.userId === 'string' &&
        typeof value.deviceId === 'string'
        ? value
        : null;
    } catch {
      return null;
    }
  },
  save: async (value) => {
    if (value)
      await SecureStore.setItemAsync(REGISTRATION_KEY, JSON.stringify(value));
    else await SecureStore.deleteItemAsync(REGISTRATION_KEY);
  },
});

export function syncPushSession(): Promise<void> {
  const state = useAuthStore.getState();
  return pushRegistration.sync(
    state.isAuthenticated && state.userId && state.accessToken
      ? { userId: state.userId, accessToken: state.accessToken }
      : null,
  );
}

// Runs before /auth/logout while the account still has a valid access token.
setPushCleanup(() => pushRegistration.sync(null));
