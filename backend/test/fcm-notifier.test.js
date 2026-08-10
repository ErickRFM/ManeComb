const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const {
  buildFcmMessage,
  createFcmNotifier,
  isExpiredIncomingCallPayload,
  resolveServiceAccount,
  resolveTtlSeconds,
} = require('../src/services/fcm-notifier');
const { createRtcCallService } = require('../src/services/rtc-call-service');

function serviceAccountEnv() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    FCM_PROJECT_ID: 'manecomb-test',
    FCM_CLIENT_EMAIL: 'push@manecomb-test.iam.gserviceaccount.com',
    FCM_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

async function testFcmProvider() {
  const env = serviceAccountEnv();
  const requests = [];
  let oauthCalls = 0;
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes('oauth2.googleapis.com')) {
      oauthCalls += 1;
      return {
        ok: true,
        async json() {
          return { access_token: 'access-token', expires_in: 3600 };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { name: 'projects/manecomb-test/messages/1' };
      },
    };
  };
  const nowMs = 1_700_000_000_000;
  const expiresAt = new Date(nowMs + 35_000).toISOString();
  const callPayload = {
    category: 'call',
    level: 'critical',
    title: 'Ana te está llamando',
    body: 'Llamada de audio',
    data: {
      type: 'incoming_call',
      callId: 'call-1',
      mode: 'audio',
      expiresAt,
      ringTimeoutMs: '35000',
    },
  };
  const notifier = createFcmNotifier({ env, fetchImpl, now: () => nowMs });

  const result = await notifier.sendMany(
    [{ token: 'native-fcm-token-1', platform: 'android' }],
    callPayload
  );
  await notifier.sendMany(
    [{ token: 'native-fcm-token-2', platform: 'android' }],
    { category: 'chat', title: 'Ana', body: 'Hola', data: { conversationId: 'conv-1' } }
  );

  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.equal(oauthCalls, 1, 'el access token OAuth debe reutilizarse');
  const fcmRequest = requests.find((entry) => entry.url.includes('fcm.googleapis.com'));
  const body = JSON.parse(fcmRequest.options.body);
  assert.equal(body.message.data.type, 'incoming_call');
  assert.equal(body.message.data.callId, 'call-1');
  assert.equal(body.message.android.priority, 'HIGH');
  assert.equal(body.message.android.ttl, '35s');
  assert.equal(resolveTtlSeconds(callPayload, nowMs + 5_000), 30);
  assert.equal(buildFcmMessage('token-delayed', callPayload, nowMs + 5_000).android.ttl, '30s');
  assert.equal(isExpiredIncomingCallPayload(callPayload, nowMs + 35_000), true);
}

function testPayloadContract() {
  assert.equal(resolveServiceAccount({}), null);
  const message = buildFcmMessage('token', {
    category: 'chat',
    title: 'Mensaje',
    body: 'Hola',
    data: { conversationId: 'conv-1', encrypted: false, count: 2 },
  });
  assert.equal(message.data.encrypted, 'false');
  assert.equal(message.data.count, '2');
  assert.equal(message.data.type, 'chat_message');
  assert.equal(message.android.priority, 'HIGH');

  // La gravedad la resuelve backend; el dispositivo debe consumirla, no volver a
  // deducirla desde severity ni desde el texto del titulo.
  const sos = buildFcmMessage('token', {
    category: 'sos',
    level: 'critical',
    title: 'SOS activo: Accidente',
    body: 'Erik reporto accidente.',
    deepLink: '/incidencias?incidentId=inc-1&focus=sos',
    data: { incidentId: 'inc-1', severity: 'critical', type: 'accidente' },
  });
  assert.equal(sos.data.level, 'critical');
  assert.equal(sos.data.category, 'sos');
  assert.equal(sos.data.incidentId, 'inc-1');
  assert.equal(sos.data.severity, 'critical');
  assert.equal(sos.data.deepLink, '/incidencias?incidentId=inc-1&focus=sos');
  assert.equal(sos.android.priority, 'HIGH');
  assert.equal(sos.android.ttl, '60s');

  const warning = buildFcmMessage('token', {
    category: 'incident',
    level: 'warning',
    title: 'Nueva incidencia: Falla mecanica',
    body: 'Erik reporto mecanica.',
    data: { incidentId: 'inc-2', severity: 'high', type: 'mecanica' },
  });
  assert.equal(warning.data.level, 'warning');
  assert.equal(warning.data.category, 'incident');
  assert.equal(warning.android.priority, 'HIGH');
  assert.equal(warning.android.ttl, '60s');

  const info = buildFcmMessage('token', {
    category: 'incident',
    level: 'info',
    data: { incidentId: 'inc-3', severity: 'low', type: 'otro' },
  });
  assert.equal(info.data.level, 'info');
  assert.equal(info.android.priority, 'NORMAL');
  assert.equal(info.android.ttl, '60s');

  // Sin level explicito el campo viaja vacio en vez de inventarse un valor.
  const unknown = buildFcmMessage('token', { category: 'incident', data: { incidentId: 'inc-4' } });
  assert.equal(unknown.data.level, '');
}

async function testCallPushLifecycle() {
  const pushed = [];
  const emitted = [];
  const service = createRtcCallService({
    store: {
      async canUserAccessConversation() { return true; },
      async getConversationById() {
        return {
          id: 'conv-1',
          organizationId: 'org-1',
          participants: ['caller-1', 'callee-1'],
        };
      },
    },
    emitToUser(userId, event, payload) {
      emitted.push({ userId, event, payload });
    },
    async deliverNotification(input) {
      pushed.push(input.payload);
    },
    setTimeoutFn() { return { timer: true }; },
    clearTimeoutFn() {},
    now: () => 1_700_000_000_000,
  });

  const started = await service.startCall({
    caller: { id: 'caller-1', name: 'Ana', organizationId: 'org-1' },
    conversationId: 'conv-1',
    mode: 'video',
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(started.ok, true);
  assert.equal(pushed[0].data.type, 'incoming_call');
  assert.equal(pushed[0].data.callId, started.callId);
  assert.equal(pushed[0].data.callerName, 'Ana');
  assert.equal(pushed[0].data.mode, 'video');
  assert.ok(pushed[0].deepLink.includes('action=incoming'));
  assert.ok(pushed[0].deepLink.includes('expiresAt='));
  assert.ok(pushed[0].deepLink.includes('ringTimeoutMs=35000'));
  assert.equal(pushed[0].ttlSeconds, undefined, 'incoming push TTL is derived by FCM from expiresAt at send time');
  assert.ok(emitted.some((entry) => entry.event === 'rtc:incoming-call'));

  const expiredNotifier = createFcmNotifier({
    env: serviceAccountEnv(),
    fetchImpl: async () => { throw new Error('expired call must not reach transport'); },
    now: () => Date.parse(started.expiresAt),
  });
  const expiredResult = await expiredNotifier.sendMany(
    [{ token: 'native-expired-call', platform: 'android' }],
    pushed[0]
  );
  assert.equal(expiredResult.skipped, 1);
  assert.equal(expiredResult.results[0].reason, 'expired_call');

  const accepted = await service.accept({
    user: { id: 'callee-1' },
    callId: started.callId,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(accepted.ok, true);
  assert.ok(pushed.some((payload) =>
    payload.data.type === 'call_dismiss' && payload.data.reason === 'accepted'
  ));
}

(async () => {
  testPayloadContract();
  await testFcmProvider();
  await testCallPushLifecycle();
  console.log('fcm-notifier tests passed');
})();
