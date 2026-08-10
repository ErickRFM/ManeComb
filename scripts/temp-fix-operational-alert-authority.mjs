import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceExact(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing exact block: ${label}`);
  return source.replace(from, to);
}

// Backend: bounded operational TTL + warning transport priority.
{
  const path = 'backend/src/services/fcm-notifier.js';
  let source = read(path);
  source = replaceExact(
    source,
    'const DEFAULT_CALL_TTL_SECONDS = 35;\n',
    'const DEFAULT_CALL_TTL_SECONDS = 35;\nconst DEFAULT_OPERATIONAL_ALERT_TTL_SECONDS = 60;\n',
    'operational ttl constant'
  );
  source = replaceExact(
    source,
`function isUrgentPayload(payload = {}) {
  const category = String(payload.category || payload.data?.category || "").toLowerCase();
  return (
    payload.level === "critical" ||
    category === "call" ||
    category === "chat" ||
    category === "sos" ||
    category === "emergency"
  );
}`,
`const OPERATIONAL_ALERT_CATEGORIES = new Set([
  "sos", "emergency", "emergencies", "emergencia", "emergencias",
  "incident", "incidents", "incidente", "incidencias"
]);

function isOperationalAlertPayload(payload = {}) {
  const category = String(payload.category || payload.data?.category || "").trim().toLowerCase();
  return OPERATIONAL_ALERT_CATEGORIES.has(category);
}

function isUrgentPayload(payload = {}) {
  const category = String(payload.category || payload.data?.category || "").toLowerCase();
  const level = String(payload.level || payload.data?.level || "").trim().toLowerCase();
  return (
    level === "critical" ||
    (isOperationalAlertPayload(payload) && level === "warning") ||
    category === "call" ||
    category === "chat" ||
    category === "sos" ||
    category === "emergency"
  );
}`,
    'urgent payload policy'
  );
  source = replaceExact(
    source,
`  if (String(payload.category || payload.data?.category || "").toLowerCase() === "call") {
    const deadlineMs = incomingCallDeadlineMs(payload);
    if (deadlineMs != null) {
      const remainingMs = Math.max(0, deadlineMs - nowMs);
      return Math.max(1, Math.floor(remainingMs / 1000));
    }
    return DEFAULT_CALL_TTL_SECONDS;
  }

  return DEFAULT_CHAT_TTL_SECONDS;`,
`  if (String(payload.category || payload.data?.category || "").toLowerCase() === "call") {
    const deadlineMs = incomingCallDeadlineMs(payload);
    if (deadlineMs != null) {
      const remainingMs = Math.max(0, deadlineMs - nowMs);
      return Math.max(1, Math.floor(remainingMs / 1000));
    }
    return DEFAULT_CALL_TTL_SECONDS;
  }

  if (isOperationalAlertPayload(payload)) {
    return DEFAULT_OPERATIONAL_ALERT_TTL_SECONDS;
  }

  return DEFAULT_CHAT_TTL_SECONDS;`,
    'operational ttl selection'
  );
  write(path, source);
}

// Backend regressions for critical/warning/info transport contract.
{
  const path = 'backend/test/fcm-notifier.test.js';
  let source = read(path);
  source = replaceExact(
    source,
    `  assert.equal(sos.android.priority, 'HIGH');\n`,
    `  assert.equal(sos.android.priority, 'HIGH');\n  assert.equal(sos.android.ttl, '60s');\n`,
    'sos ttl assertion'
  );
  source = replaceExact(
    source,
    `  assert.equal(warning.data.level, 'warning');\n  assert.equal(warning.data.category, 'incident');\n`,
    `  assert.equal(warning.data.level, 'warning');\n  assert.equal(warning.data.category, 'incident');\n  assert.equal(warning.android.priority, 'HIGH');\n  assert.equal(warning.android.ttl, '60s');\n`,
    'warning transport assertions'
  );
  source = replaceExact(
    source,
    `  assert.equal(info.data.level, 'info');\n`,
    `  assert.equal(info.data.level, 'info');\n  assert.equal(info.android.priority, 'NORMAL');\n  assert.equal(info.android.ttl, '60s');\n`,
    'info transport assertions'
  );
  write(path, source);
}

// Native policy: dedup horizon must outlive FCM operational delivery window.
{
  const path = 'mobile/android/app/src/main/java/com/anonymous/combiscontrol/notifications/ManeCombAlertPolicy.kt';
  let source = read(path);
  source = replaceExact(source, '  const val DEDUP_WINDOW_MS = 8_000L\n  private const val DEDUP_MAX_ENTRIES = 64', '  // Operational FCM TTL is 60 s. Keep the shared identity memory beyond that\n  // transport horizon so a delayed second transport cannot replay feedback.\n  const val DEDUP_WINDOW_MS = 75_000L\n  private const val DEDUP_MAX_ENTRIES = 256', 'dedup horizon');
  write(path, source);
}

// Renderer becomes the one notification/channel authority in foreground and background.
{
  const path = 'mobile/android/app/src/main/java/com/anonymous/combiscontrol/notifications/ManeCombPushNotificationRenderer.kt';
  let source = read(path);
  const start = source.indexOf('  fun showOperationalAlert(context: Context, data: Map<String, String>) {');
  const end = source.indexOf('\n  fun showMessage(context: Context, data: Map<String, String>) {', start);
  if (start < 0 || end < 0) throw new Error('showOperationalAlert boundaries changed');
  const replacement = `  fun showOperationalAlert(context: Context, data: Map<String, String>): Boolean {
    // Foreground and background intentionally share this exact path. Posting
    // through NotificationChannel lets Android honor the user-selected sound,
    // vibration, importance, DND and mute policy instead of bypassing it with
    // MediaPlayer/Vibrator when JS happens to be alive.
    if (!canPostNotifications(context)) return false

    val feedback = ManeCombAlertPolicy.resolve(
      data["category"],
      data["level"],
      data["severity"]
    ) ?: return false

    val incidentId = data["incidentId"].orEmpty().trim()
    val title = data["title"].orEmpty().ifBlank { "ManeComb" }
    val body = data["body"].orEmpty().ifBlank { "Nueva alerta operativa." }

    if (!ManeCombAlertPolicy.shouldEmitAlert(
        incidentId.ifEmpty { title },
        System.currentTimeMillis()
      )
    ) {
      return false
    }

    ManeCombAlertPolicy.ensureChannels(context)

    val notificationId = ManeCombAlertPolicy.notificationIdFor(incidentId, title)
    val contentIntent = activityIntent(
      context,
      notificationId,
      normalizeDeepLink(data["deepLink"], "/incidencias")
    )

    // Lockscreen public version never reuses business title/body. The private
    // notification still contains the operational detail after unlock.
    val publicTitle = if (feedback.channelId == ManeCombAlertPolicy.CHANNEL_SOS) {
      "Alerta SOS de ManeComb"
    } else {
      "Alerta operativa de ManeComb"
    }
    val publicVersion = NotificationCompat.Builder(context, feedback.channelId)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(publicTitle)
      .setCategory(NotificationCompat.CATEGORY_EVENT)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()

    val builder = NotificationCompat.Builder(context, feedback.channelId)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(contentIntent)
      .setCategory(NotificationCompat.CATEGORY_EVENT)
      .setPriority(feedback.priority)
      .setAutoCancel(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion)

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      builder.setSound(ManeCombAlertPolicy.soundUri(context, feedback))
      builder.setVibrate(feedback.vibrationPattern)
    }

    NotificationManagerCompat.from(context).notify(notificationId, builder.build())
    return true
  }`;
  source = source.slice(0, start) + replacement + source.slice(end);
  write(path, source);
}

// React Native module delegates to the renderer instead of manually playing audio/haptics.
{
  const path = 'mobile/android/app/src/main/java/com/anonymous/combiscontrol/notifications/ManeCombNotificationModule.kt';
  let source = read(path);
  const start = source.indexOf('  /**\n   * Feedback audible y haptico de una alerta operativa con la app abierta.');
  const end = source.indexOf('  @ReactMethod\n  fun show(', start);
  if (start < 0 || end < 0) throw new Error('playOperationalAlert boundaries changed');
  const replacement = `  /**
   * Socket/JS reaches the exact same native NotificationChannel authority as FCM.
   * No direct MediaPlayer/Vibrator path exists, so foreground cannot bypass the
   * user's channel settings or race a push with a second feedback mechanism.
   */
  @ReactMethod
  fun playOperationalAlert(
    incidentId: String?,
    category: String?,
    level: String?,
    severity: String?,
    title: String?,
    body: String?,
    deepLink: String?,
    promise: Promise
  ) {
    try {
      val emitted = ManeCombPushNotificationRenderer.showOperationalAlert(
        reactContext,
        mapOf(
          "incidentId" to incidentId?.trim().orEmpty(),
          "category" to category?.trim().orEmpty(),
          "level" to level?.trim().orEmpty(),
          "severity" to severity?.trim().orEmpty(),
          "title" to title?.trim().orEmpty(),
          "body" to body?.trim().orEmpty(),
          "deepLink" to deepLink?.trim().orEmpty()
        )
      )
      promise.resolve(emitted)
    } catch (error: Exception) {
      promise.reject("operational_alert_failed", error)
    }
  }

`;
  source = source.slice(0, start) + replacement + source.slice(end);
  write(path, source);
}

// JS payload carries private notification content to the shared renderer.
{
  const path = 'mobile/src/utils/operational-alert.ts';
  let source = read(path);
  source = replaceExact(
    source,
`export type OperationalAlert = {
  incidentId: string;
  category: string;
  level: string;
  severity: string;
};`,
`export type OperationalAlert = {
  incidentId: string;
  category: string;
  level: string;
  severity: string;
  title: string;
  body: string;
  deepLink: string;
};`,
    'OperationalAlert shape'
  );
  source = replaceExact(
    source,
`  return {
    incidentId,
    category,
    level: text(notification.level) || text(data.level),
    severity: text(data.severity),
  };`,
`  return {
    incidentId,
    category,
    level: text(notification.level) || text(data.level),
    severity: text(data.severity),
    title: text(notification.title) || text(data.title) || 'Alerta operativa de ManeComb',
    body: text(notification.body) || text(data.body) || 'Nueva alerta operativa.',
    deepLink: text(notification.deepLink) || text(data.deepLink) || '/incidencias',
  };`,
    'notification operational payload'
  );
  source = replaceExact(
    source,
`  return {
    incidentId,
    category: 'sos',
    level: 'critical',
    severity: text(incident.severity) || 'critical',
  };`,
`  return {
    incidentId,
    category: 'sos',
    level: 'critical',
    severity: text(incident.severity) || 'critical',
    title: text(incident.title) ? \`SOS activo: \${text(incident.title)}\` : 'Alerta SOS de ManeComb',
    body: text(incident.description) || 'Nueva alerta SOS operativa.',
    deepLink: \`/incidencias?incidentId=\${encodeURIComponent(incidentId)}&focus=sos\`,
  };`,
    'sos fallback payload'
  );
  write(path, source);
}

{
  const path = 'mobile/src/utils/push-notifications.ts';
  let source = read(path);
  source = replaceExact(
    source,
`  playOperationalAlert?: (
    incidentId: string,
    category: string,
    level: string,
    severity: string
  ) => Promise<boolean>;`,
`  playOperationalAlert?: (
    incidentId: string,
    category: string,
    level: string,
    severity: string,
    title: string,
    body: string,
    deepLink: string
  ) => Promise<boolean>;`,
    'native alert signature'
  );
  source = replaceExact(
    source,
`export async function playOperationalAlertFeedback(alert: {
  incidentId: string;
  category: string;
  level: string;
  severity: string;
}) {`,
`export async function playOperationalAlertFeedback(alert: {
  incidentId: string;
  category: string;
  level: string;
  severity: string;
  title: string;
  body: string;
  deepLink: string;
}) {`,
    'alert feedback input'
  );
  source = replaceExact(
    source,
`    return await play(alert.incidentId, alert.category, alert.level, alert.severity);`,
`    return await play(
      alert.incidentId,
      alert.category,
      alert.level,
      alert.severity,
      alert.title,
      alert.body,
      alert.deepLink
    );`,
    'native alert invocation'
  );
  write(path, source);
}

// Update JS behavioral expectations for the richer shared payload.
{
  const path = 'mobile/src/utils/operational-alert.test.ts';
  let source = read(path);
  source = replaceExact(
    source,
`    expect(toOperationalAlertFromNotification(notification())).toEqual({
      incidentId: 'inc-1',
      category: 'sos',
      level: 'critical',
      severity: 'critical',
    });`,
`    expect(toOperationalAlertFromNotification(notification())).toEqual({
      incidentId: 'inc-1',
      category: 'sos',
      level: 'critical',
      severity: 'critical',
      title: 'SOS activo: Accidente',
      body: 'Erik reporto accidente.',
      deepLink: '/incidencias?incidentId=inc-1&focus=sos',
    });`,
    'critical JS expectation'
  );
  source = replaceExact(
    source,
`    expect(high).toEqual({
      incidentId: 'inc-2',
      category: 'incident',
      level: 'warning',
      severity: 'high',
    });`,
`    expect(high).toEqual({
      incidentId: 'inc-2',
      category: 'incident',
      level: 'warning',
      severity: 'high',
      title: 'SOS activo: Accidente',
      body: 'Erik reporto accidente.',
      deepLink: '/incidencias',
    });`,
    'warning JS expectation'
  );
  source = replaceExact(
    source,
`    expect(withoutNotification).toEqual({
      incidentId: 'inc-9',
      category: 'sos',
      level: 'critical',
      severity: 'critical',
    });`,
`    expect(withoutNotification).toEqual({
      incidentId: 'inc-9',
      category: 'sos',
      level: 'critical',
      severity: 'critical',
      title: 'Alerta SOS de ManeComb',
      body: 'Nueva alerta SOS operativa.',
      deepLink: '/incidencias?incidentId=inc-9&focus=sos',
    });`,
    'sos fallback expectation'
  );
  write(path, source);
}

// JVM dedup regression: delayed FCM inside 60 s TTL remains suppressed.
{
  const path = 'mobile/android/app/src/test/java/com/anonymous/combiscontrol/notifications/ManeCombAlertPolicyTest.kt';
  let source = read(path);
  source = replaceExact(
    source,
`    assertFalse(ManeCombAlertPolicy.shouldEmitAlert("inc-1", now + 3_000))
  }`,
`    assertFalse(ManeCombAlertPolicy.shouldEmitAlert("inc-1", now + 3_000))
    assertFalse(ManeCombAlertPolicy.shouldEmitAlert("inc-1", now + 30_000))
    assertTrue(ManeCombAlertPolicy.DEDUP_WINDOW_MS > 60_000L)
  }`,
    'delayed dedup regression'
  );
  write(path, source);
}

// Source-level contract for platform behavior not practical to instantiate under JS/JVM unit tests.
{
  const path = 'mobile/src/store/operational-alert-native-contract.test.js';
  write(path, `import fs from 'node:fs';\nimport path from 'node:path';\n\nfunction androidSource(name) {\n  return fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/java/com/anonymous/combiscontrol/notifications', name), 'utf8');\n}\n\ndescribe('operational alert native channel authority', () => {\n  const renderer = androidSource('ManeCombPushNotificationRenderer.kt');\n  const module = androidSource('ManeCombNotificationModule.kt');\n  const policy = androidSource('ManeCombAlertPolicy.kt');\n\n  test('foreground FCM is not discarded and socket delegates to the same renderer', () => {\n    const operational = renderer.slice(renderer.indexOf('fun showOperationalAlert'), renderer.indexOf('fun showMessage'));\n    expect(operational).not.toContain('isAppInForeground(context)');\n    expect(module).toContain('ManeCombPushNotificationRenderer.showOperationalAlert');\n    const playBlock = module.slice(module.indexOf('fun playOperationalAlert'), module.indexOf('fun show('));\n    expect(playBlock).not.toContain('MediaPlayer');\n    expect(playBlock).not.toContain('Vibrator');\n  });\n\n  test('lockscreen public title is generic and private business title is not reused', () => {\n    const operational = renderer.slice(renderer.indexOf('fun showOperationalAlert'), renderer.indexOf('fun showMessage'));\n    const publicBlock = operational.slice(operational.indexOf('val publicVersion'), operational.indexOf('val builder'));\n    expect(publicBlock).toContain('.setContentTitle(publicTitle)');\n    expect(publicBlock).not.toContain('.setContentTitle(title)');\n    expect(operational).toContain('Alerta SOS de ManeComb');\n    expect(operational).toContain('Alerta operativa de ManeComb');\n  });\n\n  test('dedup horizon exceeds the 60 second operational FCM TTL', () => {\n    expect(policy).toContain('const val DEDUP_WINDOW_MS = 75_000L');\n  });\n});\n`);
}
