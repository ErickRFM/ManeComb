import fs from 'node:fs';
import path from 'node:path';

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('Android background alert and call feedback contract', () => {
  const renderer = read(
    '../../android/app/src/main/java/com/anonymous/combiscontrol/notifications/ManeCombPushNotificationRenderer.kt'
  );
  const fcmService = read(
    '../../android/app/src/main/java/com/anonymous/combiscontrol/notifications/ManeCombFirebaseMessagingService.kt'
  );
  const alertPolicy = read(
    '../../android/app/src/main/java/com/anonymous/combiscontrol/notifications/ManeCombAlertPolicy.kt'
  );
  const manifest = read('../../android/app/src/main/AndroidManifest.xml');

  test('data-only FCM reaches the native renderer without React being alive', () => {
    expect(fcmService).toContain('class ManeCombFirebaseMessagingService : FirebaseMessagingService()');
    expect(fcmService).toContain('override fun onMessageReceived(message: RemoteMessage)');
    expect(fcmService).toContain('ManeCombPushNotificationRenderer.render(applicationContext, data)');
    expect(manifest).toContain('android:name=".notifications.ManeCombFirebaseMessagingService"');
    expect(manifest).toContain('com.google.firebase.MESSAGING_EVENT');
  });

  test('operational alerts keep one versioned sound and vibration authority', () => {
    expect(alertPolicy).toContain('const val CHANNEL_SOS = "operacion-sos-v2"');
    expect(alertPolicy).toContain('const val CHANNEL_HIGH = "operacion-incidentes-alta-v2"');
    expect(alertPolicy).toContain('const val CHANNEL_STANDARD = "operacion-incidentes-v2"');
    expect(alertPolicy).toContain('R.raw.alert_sos');
    expect(alertPolicy).toContain('R.raw.alert_high');
    expect(alertPolicy).toContain('R.raw.alert_standard');
    expect(alertPolicy).toContain('enableVibration(true)');
    expect(alertPolicy).toContain('vibrationPattern = feedback.vibrationPattern');
    expect(alertPolicy).toContain('setSound(soundUri(context, feedback), attributes)');
    expect(alertPolicy).toContain('AudioAttributes.USAGE_NOTIFICATION_EVENT');
    expect(renderer).toContain('ManeCombAlertPolicy.isOperationalAlert(data["category"])');
    expect(renderer).toContain('showOperationalAlert(context, data)');
  });

  test('incoming calls use a fresh max-importance ringtone channel', () => {
    expect(renderer).toContain('const val CHANNEL_CALLS = "manecomb-incoming-calls-v2"');
    expect(renderer).toContain('NotificationManager.IMPORTANCE_MAX');
    expect(renderer).toContain('RingtoneManager.TYPE_RINGTONE');
    expect(renderer).toContain('AudioAttributes.CONTENT_TYPE_SONIFICATION');
    expect(renderer).toContain('AudioAttributes.USAGE_NOTIFICATION_RINGTONE');
    expect(renderer).toContain('vibrationPattern = CALL_VIBRATION_PATTERN');
    expect(renderer).toContain('NotificationCompat.CallStyle.forIncomingCall');
    expect(renderer).toContain('builder.setFullScreenIntent(contentIntent, true)');
  });

  test('pre-O calls still receive explicit ringtone and vibration', () => {
    const incoming = renderer.slice(
      renderer.indexOf('private fun showIncomingCallNotification'),
      renderer.indexOf('private fun deliverIncomingCallToForeground')
    );
    expect(incoming).toContain('Build.VERSION.SDK_INT < Build.VERSION_CODES.O');
    expect(incoming).toContain('.setSound(defaultIncomingCallSound())');
    expect(incoming).toContain('.setVibrate(CALL_VIBRATION_PATTERN)');
  });

  test('manifest keeps the permissions required for visible and haptic call alerts', () => {
    expect(manifest).toContain('android.permission.POST_NOTIFICATIONS');
    expect(manifest).toContain('android.permission.VIBRATE');
    expect(manifest).toContain('android.permission.USE_FULL_SCREEN_INTENT');
    expect(manifest).toContain('android.permission.WAKE_LOCK');
  });
});
