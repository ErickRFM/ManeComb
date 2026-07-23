const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const paymentEnvKeys = [
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MP_ACCESS_TOKEN",
  "MERCADO_PAGO_ENV",
  "MERCADOPAGO_ENV",
  "MP_ENV",
  "MERCADO_PAGO_PUBLIC_KEY",
  "MERCADOPAGO_PUBLIC_KEY",
  "MP_PUBLIC_KEY",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "MERCADOPAGO_WEBHOOK_SECRET",
  "MP_WEBHOOK_SECRET",
  "WEBHOOK_SECRET",
  "MERCADO_PAGO_WEBHOOK_URL",
  "PUBLIC_WEBHOOK_BASE_URL",
  "MERCADO_PAGO_SUCCESS_URL",
  "MERCADO_PAGO_FAILURE_URL",
  "MERCADO_PAGO_PENDING_URL",
  "NODE_ENV",
  "PAYMENT_PROVIDER",
  "RENDER",
  "REQUIRE_MONGO",
  "MONGO_URI",
  "MONGODB_URI"
];

function clearBackendRequireCache() {
  const srcRoot = `${path.sep}backend${path.sep}src${path.sep}`;
  Object.keys(require.cache).forEach((entry) => {
    if (entry.includes(srcRoot)) {
      delete require.cache[entry];
    }
  });
}

async function withPaymentEnv(overrides, callback) {
  const previous = new Map(paymentEnvKeys.map((key) => [key, process.env[key]]));

  paymentEnvKeys.forEach((key) => {
    delete process.env[key];
  });

  Object.entries({
    MONGO_URI: "",
    MONGODB_URI: "",
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "mercado_pago",
    MERCADO_PAGO_WEBHOOK_SECRET: "unit-test-webhook-secret",
    MERCADO_PAGO_WEBHOOK_URL: "https://payments.example.test/api/commercial/webhooks/mercadopago",
    MERCADO_PAGO_SUCCESS_URL: "https://payments.example.test/ventas/?checkout=success",
    MERCADO_PAGO_FAILURE_URL: "https://payments.example.test/ventas/?checkout=failure",
    MERCADO_PAGO_PENDING_URL: "https://payments.example.test/ventas/?checkout=pending",
    RENDER: "",
    REQUIRE_MONGO: "false",
    ...overrides
  }).forEach(([key, value]) => {
    if (typeof value === "undefined" || value === null) {
      delete process.env[key];
      return;
    }

    process.env[key] = String(value);
  });

  clearBackendRequireCache();

  try {
    return await callback();
  } finally {
    paymentEnvKeys.forEach((key) => {
      const value = previous.get(key);
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    clearBackendRequireCache();
  }
}

function buildWebhookHeaders(paymentId, {
  requestId = "request-unit-test",
  secret = "unit-test-webhook-secret",
  ts = "1720000000000"
} = {}) {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const signature = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return {
    "x-request-id": requestId,
    "x-signature": `ts=${ts},v1=${signature}`
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

function installMercadoPagoFetchMock({
  paymentId = "pay-manecomb",
  paymentStatus = "approved",
  paymentOverrides = {},
  preference = {
    id: "pref-manecomb",
    init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=prod",
    sandbox_init_point: "https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=sandbox"
  }
} = {}) {
  const nativeFetch = global.fetch;
  let currentPaymentStatus = paymentStatus;
  const state = {
    paymentCalls: 0,
    preferenceCalls: 0,
    preferencePayload: null
  };

  global.fetch = async (url, init = {}) => {
    const safeUrl = String(url || "");

    if (safeUrl === "https://api.mercadopago.com/checkout/preferences") {
      state.preferenceCalls += 1;
      state.preferencePayload = JSON.parse(String(init.body || "{}"));
      return jsonResponse(preference);
    }

    if (safeUrl.startsWith("https://api.mercadopago.com/v1/payments/")) {
      state.paymentCalls += 1;
      const requestedPaymentId = safeUrl.split("/").pop() || paymentId;
      return jsonResponse({
        currency_id: "MXN",
        external_reference: state.preferencePayload?.external_reference || "",
        id: requestedPaymentId,
        live_mode: process.env.MERCADO_PAGO_ENV === "production",
        metadata: state.preferencePayload?.metadata || {},
        status: currentPaymentStatus,
        transaction_amount: state.preferencePayload?.items?.[0]?.unit_price,
        ...paymentOverrides
      });
    }

    return nativeFetch(url, init);
  };

  return {
    get paymentCalls() {
      return state.paymentCalls;
    },
    get preferenceCalls() {
      return state.preferenceCalls;
    },
    get preferencePayload() {
      return state.preferencePayload;
    },
    setPaymentStatus(status) {
      currentPaymentStatus = status;
    },
    restore() {
      global.fetch = nativeFetch;
    }
  };
}

function installWebhookIdempotencyStub() {
  const seen = new Set();
  const state = {
    processed: 0,
    received: 0
  };
  const webhookPath = require.resolve("../src/services/webhook-idempotency");

  require.cache[webhookPath] = {
    exports: {
      buildWebhookDeliveryKey: ({ requestId, paymentId, notificationType, signatureTimestamp }) =>
        [requestId, paymentId, notificationType, signatureTimestamp].join("|"),
      completeWebhookDelivery: async () => {
        state.processed += 1;
        return { ok: true };
      },
      failWebhookDelivery: async () => ({ ok: true }),
      claimWebhookDelivery: async ({ deliveryKey }) => {
        state.received += 1;
        const id = String(deliveryKey || "").trim();

        if (seen.has(id)) {
          return {
            claimed: false,
            reason: "already_processed",
            event: { id: `evt-${id}` }
          };
        }

        seen.add(id);
        return {
          claimed: true,
          reason: "new",
          event: { id: `evt-${id}` }
        };
      }
    },
    filename: webhookPath,
    id: webhookPath,
    loaded: true
  };

  return state;
}

async function createTestServer({ onStore, webhookStub = false } = {}) {
  clearBackendRequireCache();

  let webhookState = null;
  if (webhookStub) {
    webhookState = installWebhookIdempotencyStub();
  }

  const createApp = require("../src/app");
  const { createEmbeddedStore } = require("../src/data/store");
  const store = createEmbeddedStore();

  if (onStore) {
    onStore(store);
  }

  const app = createApp({
    store,
    getDbState: () => ({
      connected: false,
      message: "mercado-pago-test",
      mode: "embedded"
    })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    store,
    url: `http://127.0.0.1:${address.port}/api`,
    webhookState
  };
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  return {
    payload: await response.json(),
    status: response.status
  };
}

async function registerOwner(context, stamp = Date.now()) {
  const email = `mp-owner-${stamp}@combis.app`;
  const password = "Ruta123!";
  const companyName = `MP Fleet ${stamp}`;
  const response = await requestJson(`${context.url}/auth/register`, {
    body: JSON.stringify({
      accountType: "company_owner",
      companyName,
      email,
      name: "MP Owner",
      password,
      phone: "+52 55 2000 0000"
    }),
    method: "POST"
  });

  assert.equal(response.status, 201);

  return {
    companyName,
    email,
    password,
    token: response.payload.token
  };
}

async function createCheckout(context, owner, idempotencyKey = `mp-checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`) {
  return await requestJson(`${context.url}/commercial/checkout`, {
    body: JSON.stringify({
      companyName: owner.companyName,
      contactName: "MP Owner",
      email: owner.email,
      paymentMethod: "card",
      phone: "+52 55 2000 0000",
      planId: "starter-2",
      selectedAddOns: ["radio_dispatch"]
    }),
    headers: {
      Authorization: `Bearer ${owner.token}`,
      "Idempotency-Key": idempotencyKey
    },
    method: "POST"
  });
}

async function createTrialCheckout(context, owner, idempotencyKey) {
  return await requestJson(`${context.url}/commercial/checkout`, {
    body: JSON.stringify({
      companyName: owner.companyName,
      contactName: "MP Owner",
      email: owner.email,
      paymentMethod: "trial",
      phone: "+52 55 2000 0000",
      planId: "starter-2",
      requestTrial: true,
      selectedAddOns: []
    }),
    headers: {
      Authorization: `Bearer ${owner.token}`,
      "Idempotency-Key": idempotencyKey
    },
    method: "POST"
  });
}

function loadPaymentService() {
  clearBackendRequireCache();
  return require("../src/services/commercial-payment");
}

async function testCheckoutUrlsByEnvironment() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock();
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "sandbox-url");
        const checkout = await createCheckout(context, owner);

        assert.equal(checkout.status, 201);
        assert.equal(
          checkout.payload.data.checkoutUrl,
          "https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=sandbox"
        );
        assert.equal(mp.preferencePayload.metadata.order_id, mp.preferencePayload.external_reference);
        assert.equal(mp.preferencePayload.metadata.plan_id, "starter-2");
        assert.equal(mp.preferencePayload.items[0].id, "starter-2");
        assert.equal(mp.preferencePayload.items[0].unit_price, 169);
        assert.equal(checkout.payload.data.totalPrice, 169);
        assert.equal(Object.prototype.hasOwnProperty.call(mp.preferencePayload, "payer"), false);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-token-vendedor",
      MERCADO_PAGO_ENV: "production",
      MERCADO_PAGO_PUBLIC_KEY: "APP_USR-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock();
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "production-url");
        const checkout = await createCheckout(context, owner);

        assert.equal(checkout.status, 201);
        assert.equal(
          checkout.payload.data.checkoutUrl,
          "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=prod"
        );
        assert.deepEqual(mp.preferencePayload.payer, {
          email: owner.email,
          name: "MP Owner"
        });
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - Mercado Pago selecciona sandbox_init_point o init_point segun ambiente");
}

async function testMissingCheckoutUrlFailsSafely() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock({
        preference: {
          id: "pref-sandbox-missing",
          init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=prod"
        }
      });
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "sandbox-missing-url");
        const checkout = await createCheckout(context, owner);

        assert.equal(checkout.status, 400);
        assert.equal(checkout.payload.message, "No fue posible registrar la compra");
        assert.equal(checkout.payload.message.includes("sandbox_init_point"), false);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-token-vendedor",
      MERCADO_PAGO_ENV: "production",
      MERCADO_PAGO_PUBLIC_KEY: "APP_USR-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock({
        preference: {
          id: "pref-prod-missing",
          sandbox_init_point: "https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=sandbox"
        }
      });
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "production-missing-url");
        const checkout = await createCheckout(context, owner);

        assert.equal(checkout.status, 400);
        assert.equal(checkout.payload.message, "No fue posible registrar la compra");
        assert.equal(checkout.payload.message.includes("init_point"), false);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - Mercado Pago falla de forma segura si falta la URL del ambiente activo");
}

async function testMissingExplicitEnvironmentFailsSafely() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock();
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "missing-env");
        const checkout = await createCheckout(context, owner);

        assert.equal(checkout.status, 400);
        assert.equal(checkout.payload.message, "No fue posible registrar la compra");
        assert.equal(checkout.payload.message.includes("MERCADO_PAGO_ENV"), false);
        assert.equal(checkout.payload.message.includes("MERCADOPAGO_ENV"), false);
        assert.equal(mp.preferenceCalls, 0);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - Mercado Pago exige ambiente explicito antes de crear checkout");
}

async function runConfirmationScenario(status) {
  return await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock({ paymentStatus: status });
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, `confirm-${status}`);
        const checkout = await createCheckout(context, owner);
        assert.equal(checkout.status, 201);

        const confirmation = await requestJson(`${context.url}/commercial/confirm`, {
          body: JSON.stringify({
            paymentId: `pay-${status}`
          }),
          method: "POST"
        });
        assert.equal(confirmation.status, 200);

        const session = await requestJson(`${context.url}/auth/me`, {
          headers: {
            Authorization: `Bearer ${owner.token}`
          }
        });

        return {
          confirmation: confirmation.payload.data,
          session: session.payload
        };
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );
}

async function testPaymentStatusesDoNotActivateUnlessApproved() {
  const pending = await runConfirmationScenario("pending");
  assert.equal(pending.confirmation.paymentStatus, "pending");
  assert.notEqual(pending.confirmation.activationStatus, "active");
  assert.equal(pending.session.canAccessMobile, false);
  assert.notEqual(pending.session.subscription.status, "active");

  const rejected = await runConfirmationScenario("rejected");
  assert.equal(rejected.confirmation.paymentStatus, "rejected");
  assert.notEqual(rejected.confirmation.activationStatus, "active");
  assert.equal(rejected.session.canAccessMobile, false);
  assert.notEqual(rejected.session.subscription.status, "active");

  const cancelled = await runConfirmationScenario("cancelled");
  assert.equal(cancelled.confirmation.paymentStatus, "cancelled");
  assert.notEqual(cancelled.confirmation.activationStatus, "active");
  assert.equal(cancelled.session.canAccessMobile, false);
  assert.notEqual(cancelled.session.subscription.status, "active");

  const approved = await runConfirmationScenario("approved");
  assert.equal(approved.confirmation.paymentStatus, "paid");
  assert.equal(approved.confirmation.activationStatus, "active");
  assert.equal(approved.session.canAccessMobile, true);
  assert.equal(approved.session.subscription.status, "active");
  assert.equal(approved.session.subscription.isActive, true);
  assert.equal(approved.session.tenant.status, "active");

  console.log("ok - pending/rejected no activan y approved activa plan reconocible por backend");
}

async function testPaymentProviderTestActivatesWithoutMercadoPago() {
  await withPaymentEnv(
    {
      PAYMENT_PROVIDER: "test"
    },
    async () => {
      const mp = installMercadoPagoFetchMock();
      const context = await createTestServer();

      try {
        const owner = await registerOwner(context, "test-provider");
        const checkout = await createCheckout(context, owner);

        assert.equal(checkout.status, 201);
        assert.equal(checkout.payload.data.paymentProvider, "test");
        assert.equal(checkout.payload.data.paymentStatus, "paid_test");
        assert.equal(checkout.payload.data.activationStatus, "active");
        assert.equal(checkout.payload.data.checkoutUrl, null);
        assert.equal(mp.preferenceCalls, 0);

        const session = await requestJson(`${context.url}/auth/me`, {
          headers: {
            Authorization: `Bearer ${owner.token}`
          }
        });

        assert.equal(session.payload.canAccessMobile, true);
        assert.equal(session.payload.subscription.status, "active");
        assert.equal(session.payload.tenant.status, "active");

        const changed = await requestJson(`${context.url}/account/subscription/plan`, {
          body: JSON.stringify({ planId: "control-6", selectedAddOns: ["radio_dispatch"] }),
          headers: { Authorization: `Bearer ${owner.token}` },
          method: "PATCH"
        });
        assert.equal(changed.status, 200);
        assert.equal(changed.payload.data.planId, "control-6");
        assert.equal(changed.payload.data.monthlyPrice, 319);

        const cancelled = await requestJson(`${context.url}/account/subscription/cancel`, {
          body: JSON.stringify({ reason: "commercial-flow-test" }),
          headers: { Authorization: `Bearer ${owner.token}` },
          method: "POST"
        });
        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.payload.data.status, "cancelled");

        const changeAfterCancellation = await requestJson(`${context.url}/account/subscription/plan`, {
          body: JSON.stringify({ planId: "premium-8" }),
          headers: { Authorization: `Bearer ${owner.token}` },
          method: "PATCH"
        });
        assert.equal(changeAfterCancellation.status, 409);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - PAYMENT_PROVIDER=test aprueba y activa sin llamar Mercado Pago");
}

async function testWebhookApprovedIsIdempotent() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock({ paymentId: "pay-webhook", paymentStatus: "approved" });
      let activationUpdates = 0;
      const context = await createTestServer({
        onStore: (store) => {
          const updateCommercialOrder = store.updateCommercialOrder.bind(store);
          const completePaymentEffects = store.completePaymentEffects.bind(store);
          store.updateCommercialOrder = (orderId, payload) => {
            if (payload?.activationStatus === "active") {
              activationUpdates += 1;
            }

            return updateCommercialOrder(orderId, payload);
          };
          store.completePaymentEffects = (input) => {
            if (input?.updates?.activationStatus === "active") activationUpdates += 1;
            return completePaymentEffects(input);
          };
        },
        webhookStub: true
      });

      try {
        const owner = await registerOwner(context, "webhook-idempotent");
        const checkout = await createCheckout(context, owner);
        assert.equal(checkout.status, 201);

        const firstWebhook = await requestJson(`${context.url}/commercial/webhooks/mercadopago`, {
          body: JSON.stringify({
            data: {
              id: "pay-webhook"
            },
            type: "payment"
          }),
          headers: buildWebhookHeaders("pay-webhook"),
          method: "POST"
        });
        const secondWebhook = await requestJson(`${context.url}/commercial/webhooks/mercadopago`, {
          body: JSON.stringify({
            data: {
              id: "pay-webhook"
            },
            type: "payment"
          }),
          headers: buildWebhookHeaders("pay-webhook"),
          method: "POST"
        });

        assert.equal(firstWebhook.status, 202);
        assert.equal(secondWebhook.status, 202);
        assert.equal(secondWebhook.payload.duplicate, true);
        assert.equal(context.webhookState.processed, 1);
        assert.equal(activationUpdates, 1);

        const order = await context.store.findCommercialOrderByExternalReference(
          checkout.payload.data.paymentExternalReference
        );
        assert.equal(order.activationStatus, "active");
        assert.equal(order.paymentStatus, "paid");
        assert.equal(order.starterFleet.length, 2);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - webhook approved activa una sola vez");
}

function testCredentialValidation() {
  return withPaymentEnv({}, async () => {
    const payments = loadPaymentService();

    assert.equal(payments.detectMercadoPagoEnvironment("TEST-token", ""), "missing_environment");
    assert.equal(payments.detectMercadoPagoEnvironment("APP_USR-token", ""), "missing_environment");
    assert.equal(payments.detectMercadoPagoEnvironment("APP_USR-token", "sandbox"), "sandbox");
    assert.equal(payments.getPaymentProviderName("card"), "mercado_pago");

    assert.doesNotThrow(() =>
      payments.validateMercadoPagoCredentials("TEST-token-secreto", "TEST-public-secreto", "sandbox")
    );
    assert.doesNotThrow(() =>
      payments.validateMercadoPagoCredentials("APP_USR-token-secreto", "APP_USR-public-secreto", "sandbox")
    );
    assert.doesNotThrow(() =>
      payments.validateMercadoPagoCredentials("APP_USR-token-secreto", "APP_USR-public-secreto", "production")
    );
    assert.throws(
      () =>
        payments.validateMercadoPagoCredentials("TEST-token-secreto", "TEST-public-secreto", "sandbox", {
          explicitEnv: "",
          requireExplicitEnvironment: true
        }),
      /MERCADO_PAGO_ENV.*MERCADOPAGO_ENV.*MP_ENV/
    );

    assert.doesNotThrow(() =>
      payments.validateMercadoPagoCredentials("TEST-token-secreto", "APP_USR-public-secreto", "sandbox")
    );

    for (const [accessToken, publicKey, environment] of [
      ["TEST-token-secreto", "TEST-public-secreto", "production"],
      ["APP_USR-token-secreto", "TEST-public-secreto", "production"],
      ["UNKNOWN-token-secreto", "APP_USR-public-secreto", "sandbox"]
    ]) {
      assert.throws(
        () => payments.validateMercadoPagoCredentials(accessToken, publicKey, environment),
        (error) => {
          assert.match(error.message, /Credenciales Mercado Pago inconsistentes/);
          assert.equal(error.message.includes(accessToken), false);
          assert.equal(error.message.includes(publicKey), false);
          return true;
        }
      );
    }

    assert.equal(
      payments.selectMercadoPagoCheckoutUrl(
        {
          init_point: "prod",
          sandbox_init_point: "sandbox"
        },
        "sandbox"
      ).checkoutUrl,
      "sandbox"
    );
    assert.equal(
      payments.selectMercadoPagoCheckoutUrl(
        {
          init_point: "prod",
          sandbox_init_point: "sandbox"
        },
        "production"
      ).checkoutUrl,
      "prod"
    );
    assert.throws(() => payments.selectMercadoPagoCheckoutUrl({ init_point: "prod" }, "sandbox"), /sandbox_init_point/);
    assert.throws(
      () => payments.selectMercadoPagoCheckoutUrl({ sandbox_init_point: "sandbox" }, "production"),
      /init_point/
    );

    console.log("ok - ambiente explicito acepta APP_USR ambiguo y rechaza TEST en produccion");
  });
}

async function testWebhookSignatureFailsClosed() {
  await withPaymentEnv({}, async () => {
    const payments = loadPaymentService();
    const paymentId = "pay-signature";
    const validHeaders = buildWebhookHeaders(paymentId);
    const validate = (overrides = {}) =>
      payments.isMercadoPagoWebhookSignatureValid({
        paymentId,
        requestId: validHeaders["x-request-id"],
        secret: "unit-test-webhook-secret",
        signatureHeader: validHeaders["x-signature"],
        ...overrides
      });

    assert.equal(validate(), true);
    assert.equal(validate({ secret: "" }), false);
    assert.equal(validate({ requestId: "" }), false);
    assert.equal(validate({ signatureHeader: "" }), false);
    assert.equal(validate({ signatureHeader: "ts=invalid,v1=00" }), false);
    assert.equal(validate({ paymentId: "altered-payment" }), false);
    assert.equal(
      validate({ signatureHeader: validHeaders["x-signature"].replace(/[a-f0-9]$/, "0") }),
      false
    );

    const context = await createTestServer({ webhookStub: true });
    try {
      const response = await requestJson(`${context.url}/commercial/webhooks/mercadopago`, {
        body: JSON.stringify({ data: { id: paymentId }, type: "payment" }),
        headers: {
          "x-request-id": "request-unit-test",
          "x-signature": "ts=1720000000000,v1=invalid"
        },
        method: "POST"
      });
      assert.equal(response.status, 401);
      assert.equal(context.webhookState.received, 0);
    } finally {
      await context.close();
    }
  });

  console.log("ok - webhook rechaza firma ausente o invalida antes de idempotencia");
}

async function testPaymentReadinessRestrictions() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "APP_USR-public-vendedor"
    },
    async () => {
      const readiness = loadPaymentService().getPaymentReadiness();
      assert.equal(readiness.ready, true);
      assert.deepEqual(readiness.issues, []);
      assert.equal(
        readiness.issues.includes("credential_environment_mismatch"),
        false
      );
      assert.equal(
        JSON.stringify(readiness).includes("APP_USR-token-vendedor"),
        false
      );
    }
  );

  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const readiness = loadPaymentService().getPaymentReadiness();
      assert.equal(readiness.ready, true);
      assert.deepEqual(readiness.issues, []);
      assert.equal(JSON.stringify(readiness).includes("unit-test-webhook-secret"), false);
    }
  );

  for (const [overrides, expectedIssue] of [
    [{ MERCADO_PAGO_ENV: "" }, "missing_environment"],
    [{ MERCADO_PAGO_ENV: "dev" }, "invalid_environment"],
    [{ MERCADO_PAGO_ENV: "test" }, "invalid_environment"],
    [{ MERCADO_PAGO_ACCESS_TOKEN: "" }, "missing_access_token"],
    [{ MERCADO_PAGO_WEBHOOK_SECRET: "" }, "missing_webhook_secret"],
    [{ MERCADO_PAGO_WEBHOOK_URL: "" }, "missing_webhook_url"],
    [{ MERCADO_PAGO_WEBHOOK_URL: "http://payments.example.test/api/commercial/webhooks/mercadopago" }, "invalid_webhook_url"],
    [{ MERCADO_PAGO_WEBHOOK_URL: "https://localhost/api/commercial/webhooks/mercadopago" }, "invalid_webhook_url"],
    [{ MERCADO_PAGO_WEBHOOK_URL: "https://192.168.1.20/api/commercial/webhooks/mercadopago" }, "invalid_webhook_url"],
    [{ MERCADO_PAGO_WEBHOOK_URL: "https://payments.example.test/api/commercial/webhooks/mercadopago?secret=hidden" }, "invalid_webhook_url"]
  ]) {
    await withPaymentEnv(
      {
        MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
        MERCADO_PAGO_ENV: "sandbox",
        MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor",
        ...overrides
      },
      async () => {
        const readiness = loadPaymentService().getPaymentReadiness();
        assert.equal(readiness.ready, false);
        assert.ok(readiness.issues.includes(expectedIssue), JSON.stringify(readiness));
      }
    );
  }

  console.log("ok - readiness exige ambiente, secreto y webhook HTTPS publico");
}

async function testProviderTestRejectedInProduction() {
  await withPaymentEnv(
    {
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "test"
    },
    async () => {
      const payments = loadPaymentService();
      assert.equal(payments.getPaymentReadiness().ready, false);
      assert.ok(payments.getPaymentReadiness().issues.includes("test_provider_forbidden_in_production"));

      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "test-provider-production");
        const checkout = await createCheckout(context, owner);
        assert.equal(checkout.status, 400);
        const orders = await context.store.listCommercialOrders();
        const createdOrder = orders.find((order) => order.ownerAccountEmail === owner.email);
        assert.ok(createdOrder);
        assert.equal(createdOrder.paymentStatus, "pending");
        assert.notEqual(createdOrder.paymentProvider, "test");
        assert.equal(orders.some((order) => order.paymentStatus === "paid_test"), false);
      } finally {
        await context.close();
      }
    }
  );

  console.log("ok - PAYMENT_PROVIDER=test no activa ordenes en produccion");
}

async function testPureFinancialReconciliation() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const { evaluatePaymentTransition, reconcileMercadoPagoPaymentWithOrder, toMinorUnits } = loadPaymentService();
      const order = { id: "order-1", totalPrice: 169, currency: "MXN" };
      const payment = {
        id: "pay-1",
        status: "approved",
        external_reference: "order-1",
        transaction_amount: "169.00",
        currency_id: "mxn",
        live_mode: false,
        metadata: { order_id: "order-1" }
      };
      const reconcile = (paymentOverrides = {}, orderOverrides = {}, configuration = {}) =>
        reconcileMercadoPagoPaymentWithOrder(
          { ...payment, ...paymentOverrides },
          { ...order, ...orderOverrides },
          { environment: "sandbox", ...configuration }
        );

      assert.equal(toMinorUnits(99, "MXN"), 9900);
      assert.equal(toMinorUnits(99.0, "MXN"), 9900);
      assert.equal(toMinorUnits("99.00", "MXN"), 9900);
      for (const invalid of ["", "x", -1, "1.001", NaN, Infinity, null, {}]) {
        assert.equal(toMinorUnits(invalid, "MXN"), null);
      }

      assert.equal(reconcile().ok, true);
      assert.equal(reconcile({ transaction_amount: 169 }).ok, true);
      assert.equal(reconcile({ transaction_amount: "169.0" }).ok, true);
      assert.equal(reconcile({ currency_id: "MXN" }).ok, true);
      assert.equal(reconcile({ transaction_amount: "168.99" }).code, "amount_mismatch");
      assert.equal(reconcile({ transaction_amount: "169.01" }).code, "amount_mismatch");
      assert.equal(reconcile({ transaction_amount: "" }).code, "invalid_payment_amount");
      assert.equal(reconcile({ transaction_amount: "invalid" }).code, "invalid_payment_amount");
      assert.equal(reconcile({ transaction_amount: -1 }).code, "invalid_payment_amount");
      assert.equal(reconcile({ transaction_amount: "169.001" }).code, "invalid_payment_amount");
      assert.equal(reconcile({}, { totalPrice: "invalid" }).code, "invalid_order_amount");
      assert.equal(reconcile({ currency_id: "USD" }).code, "currency_mismatch");
      assert.equal(reconcile({ currency_id: "" }).code, "invalid_currency");
      assert.equal(reconcile({ currency_id: "ZZZ" }).code, "currency_mismatch");
      assert.equal(reconcile({ external_reference: "other" }).code, "external_reference_mismatch");
      assert.equal(reconcile({ external_reference: "" }).code, "missing_external_reference");
      assert.equal(reconcile({ live_mode: true }).code, "payment_environment_mismatch");
      assert.equal(reconcile({ live_mode: undefined }).code, "payment_environment_mismatch");
      assert.equal(reconcile({ live_mode: "false" }).code, "payment_environment_mismatch");
      assert.equal(reconcile({ metadata: { order_id: "other" } }).code, "metadata_mismatch");
      assert.equal(reconcile({ metadata: {} }).ok, true);
      assert.equal(reconcile({ id: "" }).code, "invalid_payment_id");
      assert.equal(reconcile({}, {}, { linkedOrderId: "order-1" }).ok, true);
      assert.equal(reconcile({}, {}, { linkedOrderId: "order-2" }).code, "payment_already_linked_to_another_order");

      const production = reconcileMercadoPagoPaymentWithOrder(
        { ...payment, live_mode: true },
        order,
        { environment: "production" }
      );
      assert.equal(production.ok, true);
      assert.deepEqual(evaluatePaymentTransition("pending", "approved"), { decision: "apply", shouldActivate: true });
      assert.equal(evaluatePaymentTransition("paid", "approved").decision, "duplicate");
      assert.equal(evaluatePaymentTransition("paid", "pending").decision, "stale");
      assert.equal(evaluatePaymentTransition("paid", "rejected").decision, "stale");
      assert.equal(evaluatePaymentTransition("paid", "cancelled").decision, "stale");
      assert.equal(evaluatePaymentTransition("pending", "unknown").decision, "unknown");
    }
  );

  console.log("ok - conciliacion pura valida monto, moneda, referencia, ambiente, metadata y Payment ID");
}

async function testFinancialMismatchCannotActivate() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock({
        paymentStatus: "approved",
        paymentOverrides: { transaction_amount: "1.00" }
      });
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "financial-mismatch");
        const checkout = await createCheckout(context, owner);
        const orderId = checkout.payload.data.id;
        const confirmation = await requestJson(`${context.url}/commercial/confirm`, {
          body: JSON.stringify({
            externalReference: orderId,
            paymentId: "pay-wrong-amount"
          }),
          method: "POST"
        });
        assert.equal(confirmation.status, 409);
        assert.equal(confirmation.payload.message, "No fue posible confirmar el pago");
        const order = await context.store.getCommercialOrderById(orderId);
        assert.equal(order.paymentStatus, "pending");
        assert.notEqual(order.activationStatus, "active");
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - mismatch financiero responde 409 y no muta ni activa la orden");
}

async function testWebhookUsesFinancialReconciliation() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock({
        paymentId: "pay-webhook-mismatch",
        paymentStatus: "approved",
        paymentOverrides: { currency_id: "USD" }
      });
      const context = await createTestServer({ webhookStub: true });
      try {
        const owner = await registerOwner(context, "webhook-financial-mismatch");
        const checkout = await createCheckout(context, owner);
        const response = await requestJson(`${context.url}/commercial/webhooks/mercadopago`, {
          body: JSON.stringify({ data: { id: "pay-webhook-mismatch" }, external_reference: "manipulated" }),
          headers: buildWebhookHeaders("pay-webhook-mismatch"),
          method: "POST"
        });
        assert.equal(response.status, 202);
        const order = await context.store.getCommercialOrderById(checkout.payload.data.id);
        assert.equal(order.paymentStatus, "pending");
        assert.notEqual(order.activationStatus, "active");
        assert.equal(context.webhookState.processed, 0);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - webhook usa la misma conciliacion y no confia en su body financiero");
}

async function testPaymentCannotBeLinkedToAnotherOrder() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock({ paymentId: "pay-reused", paymentStatus: "approved" });
      const context = await createTestServer();
      try {
        const firstOwner = await registerOwner(context, "payment-owner-one");
        const firstCheckout = await createCheckout(context, firstOwner);
        await context.store.updateCommercialOrder(firstCheckout.payload.data.id, {
          paymentProviderReference: "pay-reused"
        });

        const secondOwner = await registerOwner(context, "payment-owner-two");
        const secondCheckout = await createCheckout(context, secondOwner);
        const confirmation = await requestJson(`${context.url}/commercial/confirm`, {
          body: JSON.stringify({
            externalReference: secondCheckout.payload.data.id,
            paymentId: "pay-reused"
          }),
          method: "POST"
        });
        assert.equal(confirmation.status, 409);
        const secondOrder = await context.store.getCommercialOrderById(secondCheckout.payload.data.id);
        assert.equal(secondOrder.paymentStatus, "pending");
        assert.notEqual(secondOrder.activationStatus, "active");
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - un Payment ID persistido en otra orden no puede reutilizarse");
}

async function testPendingWebhookCanAdvanceToApproved() {
  await withPaymentEnv(
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-vendedor",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-public-vendedor"
    },
    async () => {
      const mp = installMercadoPagoFetchMock({ paymentId: "pay-evolving", paymentStatus: "pending" });
      const context = await createTestServer({ webhookStub: true });
      try {
        const owner = await registerOwner(context, "payment-evolving");
        const checkout = await createCheckout(context, owner);
        const pending = await requestJson(`${context.url}/commercial/webhooks/mercadopago`, {
          body: JSON.stringify({ data: { id: "pay-evolving" }, type: "payment" }),
          headers: buildWebhookHeaders("pay-evolving", { requestId: "delivery-pending" }),
          method: "POST"
        });
        assert.equal(pending.status, 202);
        let order = await context.store.getCommercialOrderById(checkout.payload.data.id);
        assert.equal(order.paymentStatus, "pending");
        assert.notEqual(order.activationStatus, "active");

        mp.setPaymentStatus("approved");
        const approved = await requestJson(`${context.url}/commercial/webhooks/mercadopago`, {
          body: JSON.stringify({ data: { id: "pay-evolving" }, type: "payment" }),
          headers: buildWebhookHeaders("pay-evolving", { requestId: "delivery-approved" }),
          method: "POST"
        });
        assert.equal(approved.status, 202);
        order = await context.store.getCommercialOrderById(checkout.payload.data.id);
        assert.equal(order.paymentStatus, "paid");
        assert.equal(order.activationStatus, "active");
        assert.deepEqual(order.appliedPaymentTransitions.sort(), ["pay-evolving:paid", "pay-evolving:pending"]);

        const confirmation = await requestJson(`${context.url}/commercial/confirm`, {
          body: JSON.stringify({ paymentId: "pay-evolving" }),
          method: "POST"
        });
        assert.equal(confirmation.status, 200);
        order = await context.store.getCommercialOrderById(checkout.payload.data.id);
        assert.equal(order.appliedPaymentTransitions.filter((key) => key === "pay-evolving:paid").length, 1);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );

  console.log("ok - entregas distintas permiten pending a approved sin repetir la transicion");
}

async function testConcurrentPaymentAssociationHasSingleWinner() {
  const context = await createTestServer();
  try {
    const first = await context.store.createCommercialOrder({ companyName: "One", contactName: "One", email: "one@test.invalid", phone: "1", planId: "starter-2", paymentMethod: "card" });
    const second = await context.store.createCommercialOrder({ companyName: "Two", contactName: "Two", email: "two@test.invalid", phone: "2", planId: "starter-2", paymentMethod: "card" });
    const results = await Promise.all(
      [first, second].map((order) =>
        context.store.applyPaymentTransitionAtomically({
          orderId: order.id,
          provider: "mercado_pago",
          paymentId: "pay-concurrent",
          incomingStatus: "approved",
          confirmation: {
            approvedAt: new Date().toISOString(),
            paymentExternalReference: order.id
          }
        })
      )
    );
    assert.equal(results.filter((result) => result.applied).length, 1);
    assert.equal(results.filter((result) => result.reason === "payment_linked_elsewhere").length, 1);
  } finally {
    await context.close();
  }
  console.log("ok - dos asociaciones concurrentes del mismo Payment ID tienen un solo ganador");
}

async function testCheckoutCreationIdempotency() {
  await withPaymentEnv(
    { MERCADO_PAGO_ACCESS_TOKEN: "TEST-checkout-idempotency", MERCADO_PAGO_ENV: "sandbox", MERCADO_PAGO_PUBLIC_KEY: "TEST-checkout-public" },
    async () => {
      const mp = installMercadoPagoFetchMock();
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "checkout-idempotency");
        const key = "checkout-idempotency-stable-key-0001";
        const first = await createCheckout(context, owner, key);
        const replay = await createCheckout(context, owner, key);
        assert.equal(first.status, 201);
        assert.equal(replay.status, 201);
        assert.equal(replay.payload.data.id, first.payload.data.id);
        assert.equal(replay.payload.data.referenceCode, first.payload.data.referenceCode);
        assert.equal(replay.payload.data.checkoutUrl, first.payload.data.checkoutUrl);
        assert.equal(mp.preferenceCalls, 1);
        assert.equal((await context.store.listCommercialOrdersForUser({ email: owner.email })).filter((order) => order.id === first.payload.data.id).length, 1);

        const conflict = await requestJson(`${context.url}/commercial/checkout`, {
          body: JSON.stringify({ companyName: owner.companyName, contactName: "MP Owner", email: owner.email, paymentMethod: "card", phone: "+52 55 2000 0000", planId: "value-4", selectedAddOns: [] }),
          headers: { Authorization: `Bearer ${owner.token}`, "Idempotency-Key": key },
          method: "POST"
        });
        assert.equal(conflict.status, 409);
        assert.equal(conflict.payload.code, "idempotency_key_reused");

        const missing = await requestJson(`${context.url}/commercial/checkout`, {
          body: JSON.stringify({ companyName: owner.companyName, contactName: "MP Owner", email: owner.email, paymentMethod: "card", phone: "+52 55 2000 0000", planId: "starter-2" }),
          headers: { Authorization: `Bearer ${owner.token}` },
          method: "POST"
        });
        assert.equal(missing.status, 400);
        assert.equal(missing.payload.code, "missing_idempotency_key");

        const concurrentKey = "checkout-idempotency-concurrent-0001";
        const concurrent = await Promise.all([createCheckout(context, owner, concurrentKey), createCheckout(context, owner, concurrentKey)]);
        assert.ok(concurrent.every((result) => result.status === 201 || (result.status === 409 && result.payload.code === "checkout_in_progress")));
        if (concurrent.every((result) => result.status === 201)) {
          assert.equal(concurrent[0].payload.data.id, concurrent[1].payload.data.id);
        }
        assert.equal(mp.preferenceCalls, 2);
      } finally {
        mp.restore();
        await context.close();
      }
    }
  );
  console.log("ok - checkout usa una orden y una preferencia por clave e intencion");
}

async function testTrialEligibilityAndUniqueConsumption() {
  await withPaymentEnv(
    { PAYMENT_PROVIDER: "test" },
    async () => {
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "trial-eligibility");
        const key = "trial-eligibility-stable-key-0001";
        const first = await createTrialCheckout(context, owner, key);
        const replay = await createTrialCheckout(context, owner, key);

        assert.equal(first.status, 201);
        assert.equal(replay.status, 201);
        assert.equal(replay.payload.data.id, first.payload.data.id);
        assert.equal(replay.payload.data.trialStartedAt, first.payload.data.trialStartedAt);
        assert.equal(replay.payload.data.trialEndsAt, first.payload.data.trialEndsAt);

        const secondKey = await createTrialCheckout(context, owner, "trial-eligibility-second-key-0001");
        assert.equal(secondKey.status, 409);

        const concurrentOwner = await registerOwner(context, "trial-concurrent");
        const concurrent = await Promise.all([
          createTrialCheckout(context, concurrentOwner, "trial-concurrent-key-0001"),
          createTrialCheckout(context, concurrentOwner, "trial-concurrent-key-0002")
        ]);
        assert.deepEqual(concurrent.map((result) => result.status).sort(), [201, 409]);

        const concurrentOrders = await context.store.listCommercialOrdersForUser({ email: concurrentOwner.email });
        assert.equal(concurrentOrders.filter((order) => order.requestTrial).length, 1);

        const paidOwner = await registerOwner(context, "trial-paid-block");
        const paid = await createCheckout(context, paidOwner, "trial-paid-checkout-key-0001");
        assert.equal(paid.status, 201);
        const trialAfterPaid = await createTrialCheckout(context, paidOwner, "trial-after-paid-key-0001");
        assert.equal(trialAfterPaid.status, 409);
      } finally {
        await context.close();
      }
    }
  );
  console.log("ok - trial es unico por organizacion, idempotente y bloqueado tras pago");
}

async function testUnknownPreferenceResultDoesNotRetryBlindly() {
  await withPaymentEnv(
    { MERCADO_PAGO_ACCESS_TOKEN: "TEST-checkout-timeout", MERCADO_PAGO_ENV: "sandbox", MERCADO_PAGO_PUBLIC_KEY: "TEST-checkout-timeout-public" },
    async () => {
      const nativeFetch = global.fetch;
      let preferenceCalls = 0;
      global.fetch = async (url, init) => {
        if (String(url) === "https://api.mercadopago.com/checkout/preferences") {
          preferenceCalls += 1;
          throw new Error("simulated timeout after send");
        }
        return nativeFetch(url, init);
      };
      const context = await createTestServer();
      try {
        const owner = await registerOwner(context, "checkout-timeout");
        const key = "checkout-provider-result-unknown-0001";
        const first = await createCheckout(context, owner, key);
        const retry = await createCheckout(context, owner, key);
        assert.equal(first.status, 503);
        assert.equal(retry.status, 503);
        assert.equal(retry.payload.code, "provider_result_unknown");
        assert.equal(preferenceCalls, 1);
      } finally {
        global.fetch = nativeFetch;
        await context.close();
      }
    }
  );
  console.log("ok - timeout ambiguo no crea otra preferencia a ciegas");
}

async function main() {
  await testCredentialValidation();
  await testWebhookSignatureFailsClosed();
  await testPaymentReadinessRestrictions();
  await testPureFinancialReconciliation();
  await testCheckoutUrlsByEnvironment();
  await testMissingCheckoutUrlFailsSafely();
  await testMissingExplicitEnvironmentFailsSafely();
  await testPaymentStatusesDoNotActivateUnlessApproved();
  await testPaymentProviderTestActivatesWithoutMercadoPago();
  await testProviderTestRejectedInProduction();
  await testWebhookApprovedIsIdempotent();
  await testFinancialMismatchCannotActivate();
  await testWebhookUsesFinancialReconciliation();
  await testPaymentCannotBeLinkedToAnotherOrder();
  await testPendingWebhookCanAdvanceToApproved();
  await testConcurrentPaymentAssociationHasSingleWinner();
  await testCheckoutCreationIdempotency();
  await testTrialEligibilityAndUniqueConsumption();
  await testUnknownPreferenceResultDoesNotRetryBlindly();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
