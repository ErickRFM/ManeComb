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

    assert.equal(healthResponse.headers.get("x-trace-id"), traceId);
    assert.equal(health.ok, true);
    assert.equal(typeof health.status, "string");
    assert.equal(typeof health.uptimeSeconds, "number");
    assert.equal(typeof health.timestamp, "string");
    assert.equal("readiness" in health, false);
    assert.equal("auth" in health, false);

    const liveResponse = await fetch(`${baseUrl}/api/health/live`);
    const live = await liveResponse.json();
    assert.equal(live.ok, true);

    await fetch(`${baseUrl}/api/health/ready`);
    const metricsResponse = await fetch(`${baseUrl}/api/metrics`);
    const metrics = await metricsResponse.json();

    assert.equal(metrics.ok, true);
    assert.ok(Array.isArray(metrics.data.counters));
    assert.ok(
      metrics.data.counters.some((entry) => entry.name === "http_requests_total")
    );
    assert.ok(Array.isArray(metrics.data.timers));
  });

  console.log("ok - observabilidad health, trace y metricas");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
