const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function target(relative) {
  return path.join(root, relative);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Non-unique ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function update(relative, transform) {
  const file = target(relative);
  const source = fs.readFileSync(file, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No changes produced for ${relative}`);
  fs.writeFileSync(file, next);
}

update('backend/src/services/fcm-notifier.js', (source) => {
  source = replaceOnce(
    source,
    'const DEFAULT_CALL_TTL_SECONDS = 40;',
    'const DEFAULT_CALL_TTL_SECONDS = 35;',
    'default call ttl'
  );

  source = replaceOnce(
    source,
    `function resolveTtlSeconds(payload = {}) {\n  const explicit = Number(payload.ttlSeconds);\n  if (Number.isFinite(explicit) && explicit > 0) {\n    return Math.max(1, Math.floor(explicit));\n  }\n\n  return String(payload.category || "").toLowerCase() === "call"\n    ? DEFAULT_CALL_TTL_SECONDS\n    : DEFAULT_CHAT_TTL_SECONDS;\n}\n\nfunction buildFcmMessage(token, payload = {}) {`,
    `function incomingCallDeadlineMs(payload = {}) {\n  const category = String(payload.category || payload.data?.category || "").toLowerCase();\n  const type = String(payload.data?.type || "").toLowerCase();\n  if (category !== "call" || type !== "incoming_call") return null;\n  const parsed = Date.parse(String(payload.data?.expiresAt || ""));\n  return Number.isFinite(parsed) ? parsed : null;\n}\n\nfunction isExpiredIncomingCallPayload(payload = {}, nowMs = Date.now()) {\n  const deadlineMs = incomingCallDeadlineMs(payload);\n  return deadlineMs != null && deadlineMs <= nowMs;\n}\n\nfunction resolveTtlSeconds(payload = {}, nowMs = Date.now()) {\n  const explicit = Number(payload.ttlSeconds);\n  if (Number.isFinite(explicit) && explicit > 0) {\n    return Math.max(1, Math.floor(explicit));\n  }\n\n  if (String(payload.category || payload.data?.category || "").toLowerCase() === "call") {\n    const deadlineMs = incomingCallDeadlineMs(payload);\n    if (deadlineMs != null) {\n      const remainingMs = Math.max(0, deadlineMs - nowMs);\n      return Math.max(1, Math.floor(remainingMs / 1000));\n    }\n    return DEFAULT_CALL_TTL_SECONDS;\n  }\n\n  return DEFAULT_CHAT_TTL_SECONDS;\n}\n\nfunction buildFcmMessage(token, payload = {}, nowMs = Date.now()) {`,
    'deadline-aware ttl resolver'
  );

  source = replaceOnce(
    source,
    '      ttl: `${resolveTtlSeconds(payload)}s`,',
    '      ttl: `${resolveTtlSeconds(payload, nowMs)}s`,',
    'build fcm ttl call'
  );

  source = replaceOnce(
    source,
    `  async function sendOne(subscription, payload) {\n    if (!credentials) {\n      return { ok: false, skipped: true, token: subscription.token, reason: "not_configured" };\n    }\n    const accessToken = await getAccessToken();\n    const response = await fetchImpl(`,
    `  async function sendOne(subscription, payload) {\n    if (!credentials) {\n      return { ok: false, skipped: true, token: subscription.token, reason: "not_configured" };\n    }\n    if (isExpiredIncomingCallPayload(payload, now())) {\n      return { ok: false, skipped: true, token: subscription.token, reason: "expired_call" };\n    }\n    const accessToken = await getAccessToken();\n    const sendTime = now();\n    if (isExpiredIncomingCallPayload(payload, sendTime)) {\n      return { ok: false, skipped: true, token: subscription.token, reason: "expired_call" };\n    }\n    const response = await fetchImpl(`,
    'expired call skip before send'
  );

  source = replaceOnce(
    source,
    '        body: JSON.stringify({ message: buildFcmMessage(subscription.token, payload) })',
    '        body: JSON.stringify({ message: buildFcmMessage(subscription.token, payload, sendTime) })',
    'send-time ttl calculation'
  );

  source = replaceOnce(
    source,
    `  createFcmNotifier,\n  createServiceAccountAssertion,\n  resolveServiceAccount,`,
    `  createFcmNotifier,\n  createServiceAccountAssertion,\n  isExpiredIncomingCallPayload,\n  resolveServiceAccount,\n  resolveTtlSeconds,`,
    'deadline helper exports'
  );
  return source;
});

update('backend/src/services/rtc-call-service.js', (source) => replaceOnce(
  source,
  `      silent: Boolean(input.silent),\n      ttlSeconds: input.ttlSeconds || Math.ceil(ringTimeoutMs / 1000) + 5,\n      data: {`,
  `      silent: Boolean(input.silent),\n      ...(Number.isFinite(Number(input.ttlSeconds)) && Number(input.ttlSeconds) > 0\n        ? { ttlSeconds: Math.max(1, Math.floor(Number(input.ttlSeconds))) }\n        : {}),\n      data: {`,
  'remove incoming push ttl padding'
));

update('backend/test/fcm-notifier.test.js', (source) => {
  source = replaceOnce(
    source,
    `  buildFcmMessage,\n  createFcmNotifier,\n  resolveServiceAccount,`,
    `  buildFcmMessage,\n  createFcmNotifier,\n  isExpiredIncomingCallPayload,\n  resolveServiceAccount,\n  resolveTtlSeconds,`,
    'fcm helper imports'
  );

  source = replaceOnce(
    source,
    `  const notifier = createFcmNotifier({ env, fetchImpl, now: () => 1_700_000_000_000 });\n\n  const result = await notifier.sendMany(\n    [{ token: 'native-fcm-token-1', platform: 'android' }],\n    {\n      category: 'call',\n      level: 'critical',\n      title: 'Ana te está llamando',\n      body: 'Llamada de audio',\n      ttlSeconds: 40,\n      data: { type: 'incoming_call', callId: 'call-1', mode: 'audio' },\n    }\n  );`,
    `  const nowMs = 1_700_000_000_000;\n  const expiresAt = new Date(nowMs + 35_000).toISOString();\n  const callPayload = {\n    category: 'call',\n    level: 'critical',\n    title: 'Ana te está llamando',\n    body: 'Llamada de audio',\n    data: {\n      type: 'incoming_call',\n      callId: 'call-1',\n      mode: 'audio',\n      expiresAt,\n      ringTimeoutMs: '35000',\n    },\n  };\n  const notifier = createFcmNotifier({ env, fetchImpl, now: () => nowMs });\n\n  const result = await notifier.sendMany(\n    [{ token: 'native-fcm-token-1', platform: 'android' }],\n    callPayload\n  );`,
    'deadline-aware provider payload'
  );

  source = replaceOnce(
    source,
    `  assert.equal(body.message.android.priority, 'HIGH');\n  assert.equal(body.message.android.ttl, '40s');`,
    `  assert.equal(body.message.android.priority, 'HIGH');\n  assert.equal(body.message.android.ttl, '35s');\n  assert.equal(resolveTtlSeconds(callPayload, nowMs + 5_000), 30);\n  assert.equal(buildFcmMessage('token-delayed', callPayload, nowMs + 5_000).android.ttl, '30s');\n  assert.equal(isExpiredIncomingCallPayload(callPayload, nowMs + 35_000), true);`,
    'deadline ttl assertions'
  );

  source = replaceOnce(
    source,
    `  assert.ok(pushed[0].deepLink.includes('action=incoming'));\n  assert.ok(emitted.some((entry) => entry.event === 'rtc:incoming-call'));`,
    `  assert.ok(pushed[0].deepLink.includes('action=incoming'));\n  assert.ok(pushed[0].deepLink.includes('expiresAt='));\n  assert.ok(pushed[0].deepLink.includes('ringTimeoutMs=35000'));\n  assert.equal(pushed[0].ttlSeconds, undefined, 'incoming push TTL is derived by FCM from expiresAt at send time');\n  assert.ok(emitted.some((entry) => entry.event === 'rtc:incoming-call'));`,
    'rtc push continuity assertions'
  );

  source = replaceOnce(
    source,
    `  const accepted = await service.accept({\n    user: { id: 'callee-1' },\n    callId: started.callId,\n  });`,
    `  const expiredNotifier = createFcmNotifier({\n    env: serviceAccountEnv(),\n    fetchImpl: async () => { throw new Error('expired call must not reach transport'); },\n    now: () => Date.parse(started.expiresAt),\n  });\n  const expiredResult = await expiredNotifier.sendMany(\n    [{ token: 'native-expired-call', platform: 'android' }],\n    pushed[0]\n  );\n  assert.equal(expiredResult.skipped, 1);\n  assert.equal(expiredResult.results[0].reason, 'expired_call');\n\n  const accepted = await service.accept({\n    user: { id: 'callee-1' },\n    callId: started.callId,\n  });`,
    'expired fcm transport skip regression'
  );
  return source;
});

update('mobile/android/app/src/main/java/com/anonymous/combiscontrol/notifications/ManeCombPushNotificationRenderer.kt', (source) => {
  source = replaceOnce(
    source,
    `  private const val ENCRYPTED_REPLY_HINT = "Chat cifrado: abre la app para responder"`,
    `  private const val ENCRYPTED_REPLY_HINT = "Chat cifrado: abre la app para responder"\n  private const val DEFAULT_CALL_RING_TIMEOUT_MS = 35_000L`,
    'native default call ring timeout'
  );

  source = replaceOnce(
    source,
    `    val callId = data["callId"].orEmpty().trim()\n    if (callId.isEmpty() || isExpired(data["expiresAt"])) return\n    if (!canPostNotifications(context)) return`,
    `    val callId = data["callId"].orEmpty().trim()\n    if (callId.isEmpty()) return\n    val callTimeoutMs = remainingCallTimeoutMs(data)\n    if (callTimeoutMs <= 0L) return\n    if (!canPostNotifications(context)) return`,
    'native remaining deadline guard'
  );

  source = replaceOnce(
    source,
    '      .setTimeoutAfter(40_000L)',
    '      .setTimeoutAfter(callTimeoutMs)',
    'native notification authoritative timeout'
  );

  source = replaceOnce(
    source,
    `      .appendQueryParameter("mode", data["mode"].orEmpty().ifBlank { "audio" })\n      .appendQueryParameter("action", action)`,
    `      .appendQueryParameter("mode", data["mode"].orEmpty().ifBlank { "audio" })\n      .appendQueryParameter("expiresAt", data["expiresAt"].orEmpty())\n      .appendQueryParameter("ringTimeoutMs", data["ringTimeoutMs"].orEmpty())\n      .appendQueryParameter("action", action)`,
    'native call deep link deadline continuity'
  );

  source = replaceOnce(
    source,
    `  private fun isExpired(value: String?): Boolean {\n    val raw = value.orEmpty().trim()\n    if (raw.isEmpty()) return false\n    return try {\n      val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {\n        timeZone = TimeZone.getTimeZone("UTC")\n      }\n      (parser.parse(raw)?.time ?: Long.MAX_VALUE) <= System.currentTimeMillis()\n    } catch (_: Exception) {\n      false\n    }\n  }`,
    `  private fun parseUtcMillis(value: String?): Long? {\n    val raw = value.orEmpty().trim()\n    if (raw.isEmpty()) return null\n    return try {\n      val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {\n        timeZone = TimeZone.getTimeZone("UTC")\n      }\n      parser.parse(raw)?.time\n    } catch (_: Exception) {\n      null\n    }\n  }\n\n  private fun remainingCallTimeoutMs(data: Map<String, String>): Long {\n    val relativeLimit = data["ringTimeoutMs"]\n      ?.trim()\n      ?.toLongOrNull()\n      ?.takeIf { it > 0L }\n      ?: DEFAULT_CALL_RING_TIMEOUT_MS\n    val expiresAtMillis = parseUtcMillis(data["expiresAt"]) ?: return relativeLimit\n    val remainingMs = expiresAtMillis - System.currentTimeMillis()\n    return minOf(relativeLimit, remainingMs.coerceAtLeast(0L))\n  }`,
    'native remaining deadline helper'
  );
  return source;
});

update('mobile/src/navigation/android-runtime-hardening.test.ts', (source) => replaceOnce(
  source,
  `    expect(renderer).toContain('builder.setFullScreenIntent(contentIntent, true)');\n    expect(renderer).not.toContain('builder.setFullScreenIntent(acceptIntent, true)');`,
  `    expect(renderer).toContain('builder.setFullScreenIntent(contentIntent, true)');\n    expect(renderer).not.toContain('builder.setFullScreenIntent(acceptIntent, true)');\n    expect(renderer).toContain('.appendQueryParameter("expiresAt", data["expiresAt"].orEmpty())');\n    expect(renderer).toContain('.appendQueryParameter("ringTimeoutMs", data["ringTimeoutMs"].orEmpty())');\n    expect(renderer).toContain('.setTimeoutAfter(callTimeoutMs)');\n    expect(renderer).toContain('return minOf(relativeLimit, remainingMs.coerceAtLeast(0L))');\n    expect(renderer).not.toContain('.setTimeoutAfter(40_000L)');`,
  'android deadline continuity assertions'
));

console.log('RTC push deadline continuity codemod applied');
