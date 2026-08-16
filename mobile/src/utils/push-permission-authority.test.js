const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not isolate source section: ${start} -> ${end}`);
  }
  return text.slice(startIndex, endIndex);
}

describe('Push notification permission authority', () => {
  it('does not prompt while obtaining a native push token', () => {
    const push = source('./push-notifications.ts');
    const tokenSection = between(
      push,
      'export async function requestNativePushToken()',
      'export async function deleteNativePushToken()'
    );
    expect(tokenSection).not.toContain('PermissionsAndroid.request');
  });

  it('does not prompt while rendering an in-app notification', () => {
    const push = source('./push-notifications.ts');
    const showSection = between(
      push,
      'export async function showInAppNotification',
      'function parseEncryptedFlag'
    );
    expect(showSection).not.toContain('PermissionsAndroid.request');
  });

  it('keeps the OS prompt explicit in the session push-registration flow', () => {
    const store = source('../store/root-store.ts');
    const registerStart = store.indexOf('async function registerCurrentPushToken()');
    const permission = store.indexOf('requestAppNotificationPermission()', registerStart);
    const token = store.indexOf('requestNativePushToken()', registerStart);

    expect(registerStart).toBeGreaterThanOrEqual(0);
    expect(permission).toBeGreaterThan(registerStart);
    expect(token).toBeGreaterThan(permission);
  });

  it('clears only account-bound cards and never uses a blanket cancelAll', () => {
    const push = source('./push-notifications.ts');
    const nativeModule = source('../../android/app/src/main/java/com/anonymous/combiscontrol/notifications/ManeCombNotificationModule.kt');
    const clearSection = between(
      nativeModule,
      'fun clearSessionNotifications(promise: Promise)',
      '/**\n   * Socket/JS reaches'
    );

    expect(push).toContain('export async function clearSessionNotifications()');
    expect(push).toContain('NativeNotification.clearSessionNotifications()');
    expect(clearSection).toContain('manager.activeNotifications');
    expect(clearSection).toContain('SESSION_NOTIFICATION_CHANNEL_IDS');
    expect(clearSection).toContain('Notification.CATEGORY_SERVICE');
    expect(clearSection).not.toContain('cancelAll()');
    expect(nativeModule).toContain('ManeCombPushNotificationRenderer.CHANNEL_CALLS');
    expect(nativeModule).toContain('ManeCombAlertPolicy.CHANNEL_SOS');
  });
});
