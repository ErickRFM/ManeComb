const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const paymentEnvKeys = [
  "PAYMENT_PROVIDER",
  "MERCADO_PAGO_ENV",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_PUBLIC_KEY",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "MERCADO_PAGO_WEBHOOK_URL",
  "PUBLIC_WEBHOOK_BASE_URL"
];

function clearBackendRequireCache() {
  const srcRoot = `${path.sep}backend${path.sep}src${path.sep}`;

  Object.keys(require.cache).forEach((entry) => {
    if (entry.includes(srcRoot)) {
      delete require.cache[entry];
    }
  });
}

function configurePaymentEnv(overrides = {}) {
  paymentEnvKeys.forEach((key) => {
    delete process.env[key];
  });

  Object.entries({
    PAYMENT_PROVIDER: "mercado_pago",
    MERCADO_PAGO_ENV: "sandbox",
    MERCADO_PAGO_ACCESS_TOKEN: "TEST-readiness-token",
    MERCADO_PAGO_PUBLIC_KEY: "TEST-readiness-public-key",
    MERCADO_PAGO_WEBHOOK_SECRET: "readiness-webhook-secret",
    MERCADO_PAGO_WEBHOOK_URL:
      "https://payments.example.test/api/commercial/webhooks/mercadopago",
    ...overrides
  }).forEach(([key, value]) => {
    if (value === null) {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  });
}

function installPaymentReadinessFailure() {
  const paymentPath = require.resolve("../src/services/commercial-payment");

  require.cache[paymentPath] = {
    exports: {
      getPaymentReadiness() {
        throw new Error("sensitive-internal-readiness-error");
      }
    },
    filename: paymentPath,
    id: paymentPath,
    loaded: true
  };
}

async function createContext({ overrides, throwReadiness = false } = {}) {
  configurePaymentEnv(overrides);
  clearBackendRequireCache();

  if (throwReadiness) {
    installPaymentReadinessFailure();
  }

  const createApp = require("../src/app");
  const { createEmbeddedStore } = require("../src/data/store");
  const { signToken } = require("../src/utils/jwt");
  const store = createEmbeddedStore();
  const admin = await store.getUserById("user-admin-01");
  const viewer = await store.getUserById("user-supervisor-01");
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded" })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    adminToken: signToken(admin),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    url: `http://127.0.0.1:${server.address().port}/api/ops/readiness/payments`,
    viewerToken: signToken(viewer)
  };
}

async function requestReadiness(context, token) {
  const response = await fetch(context.url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  return {
    body: await response.json(),
    status: response.status
  };
}

function assertSafeResponse(body) {
  const serialized = JSON.stringify(body);
  const allowedPaymentFields = [
    "configured",
    "environment",
    "issues",
    "provider",
    "ready",
    "webhookConfigured",
    "webhookUrlConfigured"
  ];

  assert.deepEqual(Object.keys(body.payments).sort(), allowedPaymentFields.sort());
  assert.equal(serialized.includes("TEST-readiness-token"), false);
  assert.equal(serialized.includes("TEST-readiness-public-key"), false);
  assert.equal(serialized.includes("readiness-webhook-secret"), false);
  assert.equal(serialized.includes("MONGO_URI"), false);
  assert.equal(serialized.includes("process.env"), false);
}

async function withContext(options, callback) {
  const context = await createContext(options);

  try {
    await callback(context);
  } finally {
    await context.close();
    clearBackendRequireCache();
  }
}

async function testAuthenticationAndSafeReadyResponse() {
  await withContext({}, async (context) => {
    const unauthenticated = await requestReadiness(context);
    assert.equal(unauthenticated.status, 401);

    const forbidden = await requestReadiness(context, context.viewerToken);
    assert.equal(forbidden.status, 403);

    const authorized = await requestReadiness(context, context.adminToken);
    assert.equal(authorized.status, 200);
    assert.equal(authorized.body.ok, true);
    assert.equal(authorized.body.payments.provider, "mercado_pago");
    assert.equal(authorized.body.payments.environment, "sandbox");
    assert.equal(authorized.body.payments.configured, true);
    assert.equal(authorized.body.payments.webhookConfigured, true);
    assert.equal(authorized.body.payments.webhookUrlConfigured, true);
    assert.equal(authorized.body.payments.ready, true);
    assert.deepEqual(authorized.body.payments.issues, []);
    assertSafeResponse(authorized.body);
  });
}

async function testKnownConfigurationFailuresStayObservable() {
  const scenarios = [
    {
      key: "MERCADO_PAGO_WEBHOOK_SECRET",
      issue: "missing_webhook_secret"
    },
    {
      key: "MERCADO_PAGO_WEBHOOK_URL",
      issue: "missing_webhook_url"
    },
    {
      key: "MERCADO_PAGO_ENV",
      issue: "missing_environment"
    }
  ];

  for (const scenario of scenarios) {
    await withContext(
      { overrides: { [scenario.key]: null } },
      async (context) => {
        const result = await requestReadiness(context, context.adminToken);

        assert.equal(result.status, 200);
        assert.equal(result.body.ok, true);
        assert.equal(result.body.payments.ready, false);
        assert.equal(result.body.payments.issues.includes(scenario.issue), true);
        assertSafeResponse(result.body);
      }
    );
  }
}

async function testUnexpectedFailureIsContained() {
  await withContext({ throwReadiness: true }, async (context) => {
    const result = await requestReadiness(context, context.adminToken);
    const serialized = JSON.stringify(result.body);

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, {
      ok: false,
      code: "payments_readiness_unavailable"
    });
    assert.equal(serialized.includes("sensitive-internal-readiness-error"), false);
  });
}

async function main() {
  await testAuthenticationAndSafeReadyResponse();
  await testKnownConfigurationFailuresStayObservable();
  await testUnexpectedFailureIsContained();
  console.log("ok - readiness de pagos autenticada, autorizada y filtrada");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
