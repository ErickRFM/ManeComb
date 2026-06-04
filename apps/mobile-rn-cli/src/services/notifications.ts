import { PermissionsAndroid, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { isDevelopmentEnv } from '../config/env';

const DEFAULT_CHANNEL_ID = 'operacion-general';

async function requestAndroidNotificationPermission() {
  if (Platform.OS !== 'android' || Platform.Version < 33) {
    return true;
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function configureNotifications() {
  await notifee.createChannel({
    id: DEFAULT_CHANNEL_ID,
    name: 'Operación general',
    importance: AndroidImportance.HIGH,
  });

  await requestAndroidNotificationPermission();
  await messaging().requestPermission().catch(() => undefined);
}

export async function getFcmToken() {
  try {
    await configureNotifications();
    return await messaging().getToken();
  } catch (error) {
    if (isDevelopmentEnv) {
      console.log('[ManeCombRN:notifications] FCM no disponible todavía', error);
    }
    return null;
  }
}

export async function showLocalNotification(title: string, body: string) {
  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId: DEFAULT_CHANNEL_ID,
      pressAction: {
        id: 'default',
      },
    },
  });
}
