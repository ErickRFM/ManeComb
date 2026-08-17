const assert = require('node:assert/strict');
const { deliverOperationalNotification } = require('../src/services/notification-delivery');
const { createEmbeddedStore } = require('../src/data/store');

function createHarness() {
  const created = [];
  const emitted = [];

  return {
    created,
    emitted,
    io: {
      to(room) {
        return {
          emit(event, payload) {
            emitted.push({ room, event, payload });
          },
        };
      },
    },
    store: {
      async createNotification(notification) {
        created.push(notification);
        return { id: `notification-${created.length}`, ...notification };
      },
      async listPushSubscriptionsForUsers() {
        return [];
      },
      async listPushSubscriptionsForRoles() {
        return [];
      },
      async recordAppEvent() {},
    },
  };
}

const basePayload = {
  organizationId: 'org-1',
  title: 'Mensaje directo de Ana',
  body: 'Hola',
  level: 'info',
  targetUserIds: ['user-2'],
  deepLink: '/chat?conversationId=conv-1&channelMode=chat',
};

(async () => {
  const persisted = createHarness();
  const notification = await deliverOperationalNotification({
    io: persisted.io,
    store: persisted.store,
    payload: { ...basePayload, category: 'radio' },
  });

  assert.equal(persisted.created.length, 1, 'radio debe seguir persistiendo el feed');
  assert.equal(persisted.emitted.length, 1);
  assert.equal(persisted.emitted[0].event, 'notification:created');
  assert.ok(notification?.id);

  const transient = createHarness();
  const skipped = await deliverOperationalNotification({
    io: transient.io,
    store: transient.store,
    payload: { ...basePayload, category: 'chat' },
    persist: false,
  });

  assert.equal(transient.created.length, 0, 'chat no debe crear filas en el feed');
  assert.equal(transient.emitted.length, 0, 'chat no debe emitir notification:created');
  assert.equal(skipped, null);

  const store = createEmbeddedStore();
  const stamp = Date.now();
  const first = await store.createUser({
    name: 'Primero', email: `push-first-${stamp}@manecomb.test`, password: 'Ruta123!',
    role: 'driver', organizationId: 'push-org-a'
  });
  const second = await store.createUser({
    name: 'Segundo', email: `push-second-${stamp}@manecomb.test`, password: 'Ruta123!',
    role: 'driver', organizationId: 'push-org-b'
  });
  const token = 'device-token-reassigned';
  await store.registerPushSubscription(first.id, { token, platform: 'android' });
  assert.equal((await store.listPushSubscriptionsForUsers([first.id])).length, 1);
  await store.registerPushSubscription(second.id, { token, platform: 'android' });
  assert.equal((await store.listPushSubscriptionsForUsers([first.id])).length, 0);
  assert.equal((await store.listPushSubscriptionsForUsers([second.id])).length, 1);

  console.log('notification-delivery tests passed');
})();
