import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isExpoGo } from '@/src/utils/expo-runtime';

let notificationsConfigured = false;
let notificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null = null;

function isAndroidExpoGo() {
  return (
    Platform.OS === 'android' &&
    isExpoGo()
  );
}

async function getNotificationsModule() {
  if (Platform.OS === 'web' || isExpoGo()) {
    return null;
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').catch(() => null);
  }

  return notificationsModulePromise;
}

export type PushRouteIntent = {
  target: 'chat' | 'radio' | 'sos' | 'incidents' | 'notifications' | 'unknown';
  conversationId?: string | null;
  incidentId?: string | null;
  notificationId?: string | null;
  channelMode?: 'chat' | 'radio';
  deepLink?: string | null;
};

export async function configureAppNotifications() {
  if (notificationsConfigured) {
    return;
  }

  if (Platform.OS === 'web') {
    notificationsConfigured = true;
    return;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    notificationsConfigured = true;
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('operacion-general', {
      name: 'Operacion general',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#E11D2F',
    });
    await Notifications.setNotificationChannelAsync('sos-critical', {
      name: 'SOS critico',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300, 150, 300],
      lightColor: '#E11D2F',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  notificationsConfigured = true;
}

export async function requestExpoPushToken() {
  if (Platform.OS === 'web' || isExpoGo()) {
    return null;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return null;
  }

  await configureAppNotifications();

  const permissionState = await Notifications.getPermissionsAsync();
  const finalStatus =
    permissionState.granted || permissionState.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      ? permissionState.status
      : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null;

  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return token.data || null;
}

export async function showInAppNotification(payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  category?: string;
}) {
  if (Platform.OS === 'web') {
    return;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return;
  }

  await configureAppNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: payload.title,
      body: payload.body,
      sound: true,
      ...(Platform.OS === 'android'
        ? {
            channelId:
              payload.category === 'sos' ? 'sos-critical' : 'operacion-general',
          }
        : {}),
      data: {
        ...(payload.data || {}),
        notificationCategory: payload.category || 'system',
      },
    },
    trigger: null,
  });
}

export function getPushRouteIntent(rawData: Record<string, unknown> | null | undefined): PushRouteIntent {
  const safeData = rawData || {};
  const deepLink = String(safeData.deepLink || '').trim() || null;
  const category = String(safeData.category || safeData.notificationCategory || '').trim().toLowerCase();
  const conversationId = String(safeData.conversationId || '').trim() || null;
  const incidentId = String(safeData.incidentId || '').trim() || null;
  const notificationId = String(safeData.notificationId || '').trim() || null;
  const channelMode =
    String(safeData.channelMode || '').trim().toLowerCase() === 'radio' ? 'radio' : 'chat';

  if (deepLink) {
    return {
      target:
        deepLink.includes('/radio')
          ? 'radio'
          : deepLink.includes('/chat')
          ? channelMode === 'radio'
            ? 'radio'
            : 'chat'
          : deepLink.includes('/incidencias')
            ? incidentId
              ? 'sos'
              : 'incidents'
            : deepLink.includes('/perfil')
              ? 'notifications'
              : 'unknown',
      conversationId,
      incidentId,
      notificationId,
      channelMode,
      deepLink,
    };
  }

  if (category === 'sos' || incidentId) {
    return {
      target: 'sos',
      incidentId,
      notificationId,
      deepLink: '/incidencias',
    };
  }

  if (conversationId || category === 'chat' || category === 'radio') {
    return {
      target: category === 'radio' ? 'radio' : 'chat',
      conversationId,
      notificationId,
      channelMode: category === 'radio' ? 'radio' : channelMode,
      deepLink: category === 'radio' ? '/radio' : '/chat',
    };
  }

  return {
    target: 'notifications',
    notificationId,
    deepLink: '/perfil',
  };
}

export function addPushResponseListener(
  callback: (intent: PushRouteIntent) => void | Promise<void>
) {
  if (Platform.OS === 'web' || isAndroidExpoGo()) {
    return () => undefined;
  }

  let activeSubscription: { remove: () => void } | null = null;
  let disposed = false;

  void getNotificationsModule().then((Notifications) => {
    if (!Notifications || disposed) {
      return;
    }

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (disposed || !response?.notification?.request?.content?.data) {
        return;
      }

      void callback(
        getPushRouteIntent(response.notification.request.content.data as Record<string, unknown>)
      );
    });

    activeSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void callback(getPushRouteIntent(response.notification.request.content.data as Record<string, unknown>));
    });
  });

  return () => {
    disposed = true;
    activeSubscription?.remove();
  };
}
