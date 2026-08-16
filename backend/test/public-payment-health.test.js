const assert = require("node:assert/strict");
const http = require("node:http");

process.env.NODE_ENV = "test";
process.env.RENDER = "";
process.env.REQUIRE_MONGO = "false";
process.env.PAYMENT_PROVIDER = "manual";
process.env.BANK_TRANSFER_ACCOUNT_NAME = "ManeComb QA";
process.env.BANK_TRANSFER_CLABE = "012345678901234567";
process.env.BANK_TRANSFER_BANK_NAME = "Banco QA";

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { classifyRuntimeReadiness } = require("../src/services/runtime-readiness");

function buildOptionalDegradation(overrides = {}) {
  return {
    databaseReady: true,
    storage: { ready: false },
    payments: { ready: false },
    redis: { enabled: false, ready: false },
    queues: { enabled: false, functional: false },
    notifications: {
      email: { ready: false },
      whatsapp: { ready: false }
    },
    rtc: { ready: false },
    transcription: { provider: "none", ready: false },
    ...overrides
  };
}

async function fetchJson(server, path) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
  return {
    response,
    body: await response.json()
  };
}

async function main() {
  const degraded = classifyRuntimeReadiness(buildOptionalDegradation());
  assert.equal(degraded.ready, true, "capacidades opcionales no deben sacar la API del balanceador");
  assert.equal(degraded.status, "degraded");
  assert.deepEqual(degraded.blockers, []);
  assert.equal(degraded.degradedCapabilities.includes("payments"), true);
  assert.equal(degraded.degradedCapabilities.includes("rtc"), true);

  const databaseDown = classifyRuntimeReadiness(
    buildOptionalDegradation({ databaseReady: false })
  );
  assert.equal(databaseDown.ready, false);
  assert.equal(databaseDown.status, "not_ready");
  assert.deepEqual(databaseDown.blockers, ["database"]);

  const redisDown = classifyRuntimeReadiness(
    buildOptionalDegradation({
      storage: { ready: true },
      payments: { ready: true },
      redis: { enabled: true, ready: false },
      notifications: {
        email: { ready: true },
        whatsapp: { ready: true }
      },
      rtc: { ready: true }
    })
  );
  assert.equal(redisDown.ready, false);
  assert.equal(redisDown.status, "not_ready");
  assert.deepEqual(redisDown.blockers, ["redis"]);

  let databaseConnected = true;
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({
      connected: databaseConnected,
      mode: "embedded",
      message: "payment-health-test"
    })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const diagnostic = await fetchJson(server, "/api/health");
    const diagnosticSerialized = JSON.stringify(diagnostic.body);

    assert.equal(diagnostic.response.status, 200);
    assert.equal(diagnostic.body.ok, true);
    assert.equal(diagnostic.body.ready, true);
    assert.deepEqual(diagnostic.body.readiness?.payments, {
      mode: "manual_transfer_ready",
      provider: "manual",
      ready: true
    });
    assert.equal(diagnosticSerialized.includes(process.env.BANK_TRANSFER_CLABE), false);
    assert.equal(diagnosticSerialized.includes(process.env.BANK_TRANSFER_ACCOUNT_NAME), false);
    assert.equal(diagnosticSerialized.includes("MERCADO_PAGO_ACCESS_TOKEN"), false);

    const readyWhileDegraded = await fetchJson(server, "/api/health/ready");
    assert.equal(readyWhileDegraded.response.status, 200);
    assert.equal(readyWhileDegraded.body.ok, true);
    assert.equal(readyWhileDegraded.body.ready, true);
    assert.equal(["ok", "degraded"].includes(readyWhileDegraded.body.status), true);
    assert.equal(Array.isArray(readyWhileDegraded.body.readiness?.blockers), true);
    assert.equal(Array.isArray(readyWhileDegraded.body.readiness?.degradedCapabilities), true);
    assert.equal(Object.hasOwn(readyWhileDegraded.body.runtime || {}, "commit"), true);

    databaseConnected = false;

    const degradedDiagnostic = await fetchJson(server, "/api/health");
    assert.equal(degradedDiagnostic.response.status, 200, "diagnóstico debe seguir observable");
    assert.equal(degradedDiagnostic.body.ok, true);
    assert.equal(degradedDiagnostic.body.ready, false);
    assert.equal(degradedDiagnostic.body.status, "not_ready");
    assert.equal(degradedDiagnostic.body.readiness.blockers.includes("database"), true);

    const notReady = await fetchJson(server, "/api/health/ready");
    assert.equal(notReady.response.status, 503, "readiness core debe fallar con dependencia crítica caída");
    assert.equal(notReady.body.ok, false);
    assert.equal(notReady.body.ready, false);
    assert.equal(notReady.body.status, "not_ready");
    assert.equal(notReady.body.readiness.blockers.includes("database"), true);

    const live = await fetchJson(server, "/api/health/live");
    assert.equal(live.response.status, 200, "liveness solo certifica que el proceso responde");
    assert.deepEqual(
      { ok: live.body.ok, status: live.body.status },
      { ok: true, status: "live" }
    );

    console.log("ok - health distingue liveness, degradación opcional y readiness core con HTTP 503");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
