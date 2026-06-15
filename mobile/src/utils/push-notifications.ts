let notificationsConfigured = false;

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
}

export async function requestNativePushToken() {
  await configureAppNotifications();
  return null;
}

export async function showInAppNotification(_payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  category?: string;
}) {
  await configureAppNotifications();
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
