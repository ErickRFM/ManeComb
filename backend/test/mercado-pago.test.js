const assert = require("node:assert/strict");
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
  preference = {
    id: "pref-manecomb",
    init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=prod",
    sandbox_init_point: "https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=sandbox"
  }
} = {}) {
  const nativeFetch = global.fetch;
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
        external_reference: state.preferencePayload?.external_reference || "",
        id: requestedPaymentId,
        status: paymentStatus
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
      markWebhookProcessed: async () => {
        state.processed += 1;
        return { ok: true };
      },
      registerWebhookEvent: async ({ providerEventId }) => {
        state.received += 1;
        const id = String(providerEventId || "").trim();

        if (seen.has(id)) {
          return {
            duplicate: true,
            event: { id: `evt-${id}` }
          };
        }

        seen.add(id);
        return {
          duplicate: false,
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

async function createCheckout(context, owner) {
  return await requestJson(`${context.url}/commercial/checkout`, {
    body: JSON.stringify({
      companyName: owner.companyName,
      contactName: "MP Owner",
      email: owner.email,
      paymentMethod: "card",
      phone: "+52 55 2000 0000",
      planId: "starter-2"
    }),
    headers: {
      Authorization: `Bearer ${owner.token}`
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
        assert.match(checkout.payload.message, /sandbox_init_point/);
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
        assert.match(checkout.payload.message, /init_point/);
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
        assert.match(checkout.payload.message, /MERCADO_PAGO_ENV/);
        assert.match(checkout.payload.message, /MERCADOPAGO_ENV/);
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
          store.updateCommercialOrder = (orderId, payload) => {
            if (payload?.activationStatus === "active") {
              activationUpdates += 1;
            }

            return updateCommercialOrder(orderId, payload);
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
          method: "POST"
        });
        const secondWebhook = await requestJson(`${context.url}/commercial/webhooks/mercadopago`, {
          body: JSON.stringify({
            data: {
              id: "pay-webhook"
            },
            type: "payment"
          }),
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

    assert.equal(payments.detectMercadoPagoEnvironment("TEST-token", ""), "sandbox");
    assert.equal(payments.detectMercadoPagoEnvironment("APP_USR-token", ""), "production");
    assert.equal(payments.detectMercadoPagoEnvironment("APP_USR-token", "sandbox"), "sandbox");

    assert.doesNotThrow(() =>
      payments.validateMercadoPagoCredentials("TEST-token-secreto", "TEST-public-secreto", "sandbox")
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

    for (const [accessToken, publicKey, environment] of [
      ["APP_USR-token-secreto", "APP_USR-public-secreto", "sandbox"],
      ["TEST-token-secreto", "TEST-public-secreto", "production"],
      ["TEST-token-secreto", "APP_USR-public-secreto", "sandbox"],
      ["APP_USR-token-secreto", "TEST-public-secreto", "production"]
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

    console.log("ok - validacion de credenciales y seleccion de URL no mezcla TEST/PROD");
  });
}

async function main() {
  await testCredentialValidation();
  await testCheckoutUrlsByEnvironment();
  await testMissingCheckoutUrlFailsSafely();
  await testMissingExplicitEnvironmentFailsSafely();
  await testPaymentStatusesDoNotActivateUnlessApproved();
  await testWebhookApprovedIsIdempotent();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
