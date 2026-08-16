const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { resetMetrics } = require("../src/services/metrics");

async function withServer(handler) {
  const app = createApp({
    store: createEmbeddedStore(),
    getDbState: () => ({
      connected: false,
      mode: "embedded"
    })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    await handler(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function main() {
  resetMetrics();

  await withServer(async (baseUrl) => {
    const traceId = "test-trace-observability";
    const healthResponse = await fetch(`${baseUrl}/api/health`, {
      headers: {
        "x-trace-id": traceId
      }
    });
    const health = await healthResponse.json();

    assert.equal(healthResponse.status, 200, "health diagnóstico debe permanecer observable");
    assert.equal(healthResponse.headers.get("x-trace-id"), traceId);
    assert.equal(health.ok, true);
    assert.equal(health.ready, false);
    assert.equal(health.status, "not_ready");
    assert.equal(typeof health.uptimeSeconds, "number");
    assert.equal(typeof health.timestamp, "string");
    assert.deepEqual(
      Object.keys(health.readiness || {}).sort(),
      ["blockers", "degradedCapabilities", "payments"],
      "health público solo expone clasificación segura y readiness comercial resumido"
    );
    assert.equal(Array.isArray(health.readiness.blockers), true);
    assert.equal(health.readiness.blockers.includes("database"), true);
    assert.equal(Array.isArray(health.readiness.degradedCapabilities), true);
    assert.equal(typeof health.readiness.payments.provider, "string");
    assert.equal(typeof health.readiness.payments.mode, "string");
    assert.equal(typeof health.readiness.payments.ready, "boolean");
    assert.equal("communication" in health, false);
    assert.equal("runtime" in health, false);
    assert.equal("auth" in health, false);
    const serializedHealth = JSON.stringify(health);
    for (const secretName of [
      "BANK_TRANSFER_ACCOUNT_NAME",
      "BANK_TRANSFER_CLABE",
      "MERCADO_PAGO_ACCESS_TOKEN",
      "MERCADOPAGO_ACCESS_TOKEN",
      "accountName",
      "clabe",
      "accessToken"
    ]) {
      assert.equal(serializedHealth.includes(secretName), false);
    }

    const liveResponse = await fetch(`${baseUrl}/api/health/live`);
    const live = await liveResponse.json();
    assert.equal(liveResponse.status, 200);
    assert.equal(live.ok, true);
    assert.equal(live.status, "live");

    const readyResponse = await fetch(`${baseUrl}/api/health/ready`);
    const ready = await readyResponse.json();
    assert.equal(readyResponse.status, 503, "readiness debe fallar cuando la base core no está disponible");
    assert.equal(ready.ok, false);
    assert.equal(ready.ready, false);
    assert.equal(ready.status, "not_ready");
    assert.equal(ready.readiness.blockers.includes("database"), true);
    assert.equal(typeof ready.communication, "object");
    assert.equal(typeof ready.communication.functional, "boolean");
    assert.equal(typeof ready.communication.productionDurability, "boolean");
    assert.equal(typeof ready.communication.providerConfigured, "boolean");
    assert.equal(typeof ready.communication.history.idempotencyIndex, "boolean");
    assert.equal(typeof ready.communication.queue.connected, "boolean");
    assert.equal(typeof ready.communication.queue.functional, "boolean");
    assert.equal(typeof ready.communication.queue.durableAcrossRestart, "boolean");
    assert.equal(typeof ready.runtime, "object");
    assert.equal(Object.hasOwn(ready.runtime, "commit"), true);
    const serializedReady = JSON.stringify(ready);
    for (const secretName of ["REDIS_URL", "MONGO_URI", "RESEND_API_KEY", "redisUrl", "apiKey"]) {
      assert.equal(serializedReady.includes(secretName), false);
    }

    const metricsResponse = await fetch(`${baseUrl}/api/metrics`);
    const metrics = await metricsResponse.json();
    assert.equal(metricsResponse.status, 401);
    assert.equal(metrics.ok, false);
    assert.equal("data" in metrics, false);
  });

  console.log("ok - observabilidad pública segura separa health, liveness y readiness");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
