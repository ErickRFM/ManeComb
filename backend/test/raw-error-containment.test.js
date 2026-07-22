const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");

async function requestJson(url, { token, ...init } = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  });

  return {
    body: await response.json(),
    status: response.status
  };
}

async function createContext() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "raw-error-test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const admin = await store.getUserById("user-admin-01");
  const owner = await store.createUser({
    id: "raw-error-owner",
    name: "Owner Error Test",
    email: "raw-error-owner@combis.app",
    password: "Ruta123!",
    role: "owner",
    accountType: "company_owner",
    organizationId: admin.organizationId,
    userStatus: "active"
  }, "owner");
  const address = server.address();

  return {
    admin,
    adminToken: signToken(admin),
    baseUrl: `http://127.0.0.1:${address.port}/api`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    ownerToken: signToken(owner),
    store
  };
}

async function withInjectedStoreError(store, method, marker, action) {
  const original = store[method];
  store[method] = async () => {
    throw new Error(marker);
  };

  try {
    return await action();
  } finally {
    store[method] = original;
  }
}

function assertContained(result, { message, status, marker }) {
  assert.equal(result.status, status);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.message, message);
  assert.equal(JSON.stringify(result.body).includes(marker), false);
  assert.ok(result.body.traceId);
}

async function run() {
  const context = await createContext();
  const technicalLogs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    technicalLogs.push(args.map(String).join(" "));
  };

  try {
    const cases = [];

    cases.push(await withInjectedStoreError(context.store, "createCommercialOrder", "TECH_COMMERCIAL_701", () =>
      requestJson(`${context.baseUrl}/commercial/checkout`, {
        token: context.ownerToken,
        headers: { "Idempotency-Key": "raw-error-checkout-0001" },
        method: "POST",
        body: JSON.stringify({
          companyName: "Empresa Prueba",
          contactName: "Contacto Prueba",
          email: "contacto@prueba.test",
          phone: "5512345678",
          planId: "starter-2",
          paymentMethod: "transfer"
        })
      })
    ).then((result) => ({ module: "commercial", marker: "TECH_COMMERCIAL_701", result, status: 400, message: "No fue posible registrar la compra" })));

    cases.push(await withInjectedStoreError(context.store, "registerUser", "TECH_AUTH_702", () =>
      requestJson(`${context.baseUrl}/auth/register`, {
        method: "POST",
        body: JSON.stringify({ name: "Registro Prueba", email: "registro@prueba.test", password: "Ruta123!" })
      })
    ).then((result) => ({ module: "auth", marker: "TECH_AUTH_702", result, status: 400, message: "No fue posible registrar la cuenta" })));

    cases.push(await withInjectedStoreError(context.store, "ensureDirectConversation", "TECH_CHAT_703", () =>
      requestJson(`${context.baseUrl}/chat/conversations/direct`, {
        token: context.adminToken,
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-driver-01", channelMode: "chat" })
      })
    ).then((result) => ({ module: "chat", marker: "TECH_CHAT_703", result, status: 400, message: "No fue posible abrir el canal directo" })));

    cases.push(await withInjectedStoreError(context.store, "getConversationById", "TECH_RADIO_704", () =>
      requestJson(`${context.baseUrl}/radio/messages`, {
        token: context.adminToken,
        method: "POST",
        body: JSON.stringify({ channelId: "conversation-general" })
      })
    ).then((result) => ({ module: "radio", marker: "TECH_RADIO_704", result, status: 422, message: "No fue posible guardar el audio de radio" })));

    const documents = await context.store.listDocuments({ organizationId: context.admin.organizationId });
    assert.ok(documents[0]?.id, "Se requiere un documento seed para la prueba HTTP");
    cases.push(await withInjectedStoreError(context.store, "reviewDocument", "TECH_DOCUMENTS_705", () =>
      requestJson(`${context.baseUrl}/documents/${documents[0].id}/review`, {
        token: context.adminToken,
        method: "PATCH",
        body: JSON.stringify({ reviewStatus: "approved" })
      })
    ).then((result) => ({ module: "documents", marker: "TECH_DOCUMENTS_705", result, status: 400, message: "No fue posible revisar el documento" })));

    cases.push(await withInjectedStoreError(context.store, "updateUser", "TECH_USERS_706", () =>
      requestJson(`${context.baseUrl}/users/me`, {
        token: context.adminToken,
        method: "PATCH",
        body: JSON.stringify({ name: "Nombre actualizado" })
      })
    ).then((result) => ({ module: "users", marker: "TECH_USERS_706", result, status: 400, message: "No fue posible actualizar el perfil" })));

    cases.push(await withInjectedStoreError(context.store, "createVehicle", "TECH_VEHICLES_707", () =>
      requestJson(`${context.baseUrl}/vehicles`, {
        token: context.adminToken,
        method: "POST",
        body: JSON.stringify({ code: "ERR-707", plate: "ERR-707" })
      })
    ).then((result) => ({ module: "vehicles", marker: "TECH_VEHICLES_707", result, status: 400, message: "No fue posible crear la unidad" })));

    cases.push(await withInjectedStoreError(context.store, "registerPushSubscription", "TECH_NOTIFICATIONS_708", () =>
      requestJson(`${context.baseUrl}/notifications/push-subscriptions`, {
        token: context.adminToken,
        method: "POST",
        body: JSON.stringify({ token: "push-test-token", platform: "android" })
      })
    ).then((result) => ({ module: "notifications", marker: "TECH_NOTIFICATIONS_708", result, status: 400, message: "No fue posible registrar el dispositivo para push" })));

    for (const testCase of cases) {
      assertContained(testCase.result, testCase);
      assert.ok(
        technicalLogs.some((entry) => entry.includes(testCase.marker)),
        `El detalle técnico de ${testCase.module} debe quedar en logs`
      );
    }

    console.log("ok - 8 modulos preservan status, ocultan detalle tecnico y registran el error real");
  } finally {
    console.error = originalConsoleError;
    await context.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
