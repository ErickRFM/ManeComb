const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('Android runtime hardening', () => {
  const mobileRoot = nodeProcess.cwd();

  it('provides Mapbox native configuration before Fabric creates MapView', () => {
    const gradle = fs.readFileSync(path.join(mobileRoot, 'android', 'app', 'build.gradle'), 'utf8');
    const releaseScript = fs.readFileSync(path.join(mobileRoot, 'scripts', 'build-android-apk.js'), 'utf8');

    expect(gradle).toContain('resValue "string", "mapbox_access_token", mapboxAccessToken');
    expect(gradle).toContain("!mapboxAccessToken.startsWith('pk.')");
    expect(releaseScript).toContain("fileEnv.MAPBOX_ACCESS_TOKEN || '').startsWith('pk.')");
  });

  it('does not access credential-encrypted preferences during locked boot', () => {
    const manifest = fs.readFileSync(path.join(mobileRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    const receiver = fs.readFileSync(
      path.join(mobileRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'anonymous', 'combiscontrol', 'location', 'ManeCombBootReceiver.kt'),
      'utf8'
    );

    expect(manifest).not.toContain('android:directBootAware="true"');
    expect(manifest).not.toContain('android.intent.action.LOCKED_BOOT_COMPLETED');
    expect(receiver).not.toContain('Intent.ACTION_LOCKED_BOOT_COMPLETED');
  });

  it('wires FCM data delivery without requiring credentials in CI', () => {
    const rootGradle = fs.readFileSync(path.join(mobileRoot, 'android', 'build.gradle'), 'utf8');
    const appGradle = fs.readFileSync(path.join(mobileRoot, 'android', 'app', 'build.gradle'), 'utf8');
    const manifest = fs.readFileSync(path.join(mobileRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');

    expect(rootGradle).toContain("com.google.gms:google-services:4.4.4");
    expect(appGradle).toContain("com.google.firebase:firebase-messaging");
    expect(appGradle).toContain("if (googleServicesConfigFile.exists())");
    expect(appGradle).toContain("MANECOMB_FIREBASE_CONFIGURED");
    expect(manifest).toContain('.notifications.ManeCombFirebaseMessagingService');
    expect(manifest).toContain('com.google.firebase.MESSAGING_EVENT');
  });

  it('renders calls with explicit accept/reject and skew-resilient FCM timing', () => {
    const renderer = fs.readFileSync(
      path.join(
        mobileRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'anonymous',
        'combiscontrol',
        'notifications',
        'ManeCombPushNotificationRenderer.kt'
      ),
      'utf8'
    );
    const service = fs.readFileSync(
      path.join(
        mobileRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'anonymous',
        'combiscontrol',
        'notifications',
        'ManeCombFirebaseMessagingService.kt'
      ),
      'utf8'
    );

    expect(renderer).toContain('NotificationCompat.CallStyle.forIncomingCall');
    expect(renderer).toContain('ManeCombCallActionReceiver.ACTION_REJECT');
    expect(renderer).toContain('builder.setFullScreenIntent(contentIntent, true)');
    expect(renderer).not.toContain('builder.setFullScreenIntent(acceptIntent, true)');
    expect(renderer).toContain('.appendQueryParameter("expiresAt", deadline.localExpiresAt)');
    expect(renderer).toContain('.appendQueryParameter("ringTimeoutMs", deadline.timeoutMs.toString())');
    expect(renderer).toContain('.setTimeoutAfter(deadline.timeoutMs)');
    expect(renderer).toContain('CLOCK_SKEW_FALLBACK_RING_MS = 10_000L');
    expect(renderer).toContain('(expiresAtMillis - fcmSentTimeMs).coerceAtLeast(0L)');
    expect(renderer).toContain('minOf(serverWindowMs, CLOCK_SKEW_FALLBACK_RING_MS)');
    expect(service).toContain('data["fcmSentTimeMs"] = message.sentTime.toString()');
    expect(service).toContain('data["fcmTtlSeconds"] = message.ttl.toString()');
    expect(renderer).not.toContain('.setTimeoutAfter(40_000L)');
  });
});
