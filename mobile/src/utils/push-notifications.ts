import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

let notificationsConfigured = false;

type ManeCombNotificationModule = {
  show: (
    title: string,
    body: string,
    category: string,
    conversationId: string,
    deepLink: string,
    encrypted: boolean
  ) => Promise<boolean>;
  getPushToken: () => Promise<string | null>;
  deletePushToken: () => Promise<boolean>;
  clearSessionNotifications?: () => Promise<boolean>;
  playOperationalAlert?: (
    incidentId: string,
    category: string,
    level: string,
    severity: string,
    title: string,
    body: string,
    deepLink: string
  ) => Promise<boolean>;
};

const NativeNotification =
  Platform.OS === 'android'
    ? (NativeModules.ManeCombNotification as ManeCombNotificationModule | undefined)
    : undefined;

/**
 * Feedback audible y haptico de una alerta operativa con la app abierta.
 *
 * Delega en la politica nativa, que decide canal/sonido/vibracion y que ademas
 * es duena de la memoria de dedup compartida con el push. Por eso no se hace
 * ninguna comprobacion de duplicados aqui: dos memorias independientes podrian
 * sonar cada una.
 */
export async function playOperationalAlertFeedback(alert: {
  incidentId: string;
  category: string;
  level: string;
  severity: string;
  title: string;
  body: string;
  deepLink: string;
}) {
  const play = NativeNotification?.playOperationalAlert;
  if (!play) return false;

  try {
    return await play(
      alert.incidentId,
      alert.category,
      alert.level,
      alert.severity,
      alert.title,
      alert.body,
      alert.deepLink
    );
  } catch {
    return false;
  }
}

export type NotificationPermissionState = 'granted' | 'denied' | 'unavailable';

export type PushRouteIntent = {
  target: 'chat' | 'radio' | 'sos' | 'incidents' | 'notifications' | 'unknown';
  conversationId?: string | null;
  incidentId?: string | null;
  notificationId?: string | null;
  channelMode?: 'chat' | 'radio';
  deepLink?: string | null;
};

/**
 * Initializes the notification runtime without owning OS permission UX.
 * Token registration and local notification rendering must never trigger the
 * Android 13+ permission dialog implicitly.
 */
export async function configureAppNotifications() {
  if (notificationsConfigured) return;
  notificationsConfigured = true;
}

/**
 * Single explicit authority for POST_NOTIFICATIONS. Callers decide when the
 * user-facing permission prompt belongs in the session flow.
 */
export async function requestAppNotificationPermission(): Promise<NotificationPermissionState> {
  await configureAppNotifications();

  if (Platform.OS !== 'android') return 'unavailable';
  if (Number(Platform.Version) < 33) return 'granted';

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  const alreadyGranted = await PermissionsAndroid.check(permission).catch(() => false);
  if (alreadyGranted) return 'granted';

  const result = await PermissionsAndroid.request(permission).catch(() => null);
  return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}

export async function requestNativePushToken() {
  await configureAppNotifications();
  if (Platform.OS !== 'android' || !NativeNotification?.getPushToken) return null;

  const token = await NativeNotification.getPushToken().catch(() => null);
  return String(token || '').trim() || null;
}

export async function deleteNativePushToken() {
  if (Platform.OS !== 'android' || !NativeNotification?.deletePushToken) return false;
  return await NativeNotification.deletePushToken().catch(() => false);
}

/**
 * Borra tarjetas ya publicadas por ManeComb cuando termina la identidad local.
 * Es deliberadamente independiente del token FCM: una sesion expirada puede no
 * tener autorizacion para desregistrar el dispositivo en servidor, pero nunca
 * debe dejar contenido de la cuenta anterior visible en el notification tray.
 */
export async function clearSessionNotifications() {
  if (Platform.OS !== 'android' || !NativeNotification?.clearSessionNotifications) return false;
  return await NativeNotification.clearSessionNotifications().catch(() => false);
}

export async function showInAppNotification(payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  category?: string;
  deepLink?: string | null;
  encrypted?: boolean;
}) {
  await configureAppNotifications();
  const encrypted =
    payload.encrypted ?? parseEncryptedFlag(payload.data?.encrypted ?? payload.data?.e2ee);

  await NativeNotification?.show(
    payload.title,
    payload.body,
    payload.category || String(payload.data?.category || 'notifications'),
    String(payload.data?.conversationId || ''),
    String(payload.deepLink || payload.data?.deepLink || ''),
    encrypted
  ).catch(() => false);
}

function parseEncryptedFlag(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() !== 'false';
  return true;
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
  return () => undefined;
}
