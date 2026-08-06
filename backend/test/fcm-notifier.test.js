const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const {
  buildFcmMessage,
  createFcmNotifier,
  resolveServiceAccount,
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
  const notifier = createFcmNotifier({ env, fetchImpl, now: () => 1_700_000_000_000 });

  const result = await notifier.sendMany(
    [{ token: 'native-fcm-token-1', platform: 'android' }],
    {
      category: 'call',
      level: 'critical',
      title: 'Ana te está llamando',
      body: 'Llamada de audio',
      ttlSeconds: 40,
      data: { type: 'incoming_call', callId: 'call-1', mode: 'audio' },
    }
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
  assert.equal(body.message.android.ttl, '40s');
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
    callerSocketId: 'socket-caller',
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
  assert.ok(emitted.some((entry) => entry.event === 'rtc:incoming-call'));

  const accepted = service.accept({
    user: { id: 'callee-1' },
    socketId: 'socket-callee',
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
