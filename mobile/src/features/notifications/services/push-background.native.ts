import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { showLocalPush } from './local-notification.native';

setBackgroundMessageHandler(getMessaging(), async (message) => {
  // Notification+data messages are already displayed by the OS. Never duplicate them.
  if (!message.notification) await showLocalPush(message.data);
});
