const assert = require("node:assert/strict");
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
    if (entry.includes(srcRoot)) delete require.cache[entry];
  });
}

function configurePaymentEnv(overrides = {}) {
  paymentEnvKeys.forEach((key) => delete process.env[key]);
  Object.entries({
    PAYMENT_PROVIDER: "mercado_pago",
    MERCADO_PAGO_ENV: "sandbox",
    MERCADO_PAGO_ACCESS_TOKEN: "TEST-readiness-token",
    MERCADO_PAGO_PUBLIC_KEY: "TEST-readiness-public-key",
    MERCADO_PAGO_WEBHOOK_SECRET: "readiness-webhook-secret",
    MERCADO_PAGO_WEBHOOK_URL: "https://payments.example.test/api/commercial/webhooks/mercadopago",
    ...overrides
  }).forEach(([key, value]) => {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  });
}

function getReadiness(overrides = {}) {
  configurePaymentEnv(overrides);
  clearBackendRequireCache();
  const { getPaymentReadiness } = require("../src/services/commercial-payment");
  return getPaymentReadiness();
}

function assertNoSecretValues(readiness) {
  const serialized = JSON.stringify(readiness);
  for (const secret of [
    "TEST-readiness-token",
    "TEST-readiness-public-key",
    "readiness-webhook-secret"
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
}

async function main() {
  const ready = getReadiness();
  assert.equal(ready.provider, "mercado_pago");
  assert.equal(ready.environment, "sandbox");
  assert.equal(ready.configured, true);
  assert.equal(ready.webhookConfigured, true);
  assert.equal(ready.webhookUrlConfigured, true);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.issues, []);
  assertNoSecretValues(ready);

  const scenarios = [
    ["MERCADO_PAGO_WEBHOOK_SECRET", "missing_webhook_secret"],
    ["MERCADO_PAGO_WEBHOOK_URL", "missing_webhook_url"],
    ["MERCADO_PAGO_ENV", "missing_environment"]
  ];

  for (const [key, expectedIssue] of scenarios) {
    const degraded = getReadiness({ [key]: null });
    assert.equal(degraded.ready, false);
    assert.equal(degraded.issues.includes(expectedIssue), true);
    assertNoSecretValues(degraded);
  }

  clearBackendRequireCache();
  console.log("ok - payment readiness remains safe at service level; HTTP authority is Platform");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
