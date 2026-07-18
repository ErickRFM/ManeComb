import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

let notificationsConfigured = false;

type ManeCombNotificationModule = {
  show: (
    title: string,
    body: string,
    category: string,
    conversationId: string,
    deepLink: string
  ) => Promise<boolean>;
};

const NativeNotification =
  Platform.OS === 'android'
    ? (NativeModules.ManeCombNotification as ManeCombNotificationModule | undefined)
    : undefined;

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

  notificationsConfigured = true;

  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(
      () => undefined
    );
  }
}

export async function requestNativePushToken() {
  await configureAppNotifications();
  return null;
}

export async function showInAppNotification(payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  category?: string;
  deepLink?: string | null;
}) {
  await configureAppNotifications();
  await NativeNotification?.show(
    payload.title,
    payload.body,
    payload.category || String(payload.data?.category || 'notifications'),
    String(payload.data?.conversationId || ''),
    String(payload.deepLink || payload.data?.deepLink || '')
  ).catch(() => false);
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
  _callback: (intent: PushRouteIntent) => void | Promise<void>
) {
  return () => {
    // Native push provider is intentionally not wired until FCM/Notifee credentials exist.
  };
}
