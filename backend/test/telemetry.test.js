const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { recordAppEventSafely } = require("../src/services/telemetry");

async function testTelemetryIsolation() {
  const unhandledRejections = [];
  const handleUnhandledRejection = (error) => {
    unhandledRejections.push(error);
  };

  process.on("unhandledRejection", handleUnhandledRejection);

  try {
    recordAppEventSafely(
      {
        recordAppEvent() {
          throw new Error("sync telemetry failure");
        }
      },
      {}
    );
    recordAppEventSafely(
      {
        recordAppEvent() {
          return Promise.reject(new Error("async telemetry failure"));
        }
      },
      {}
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(unhandledRejections, []);
    console.log("ok - errores de telemetria secundaria no generan unhandledRejection");
  } finally {
    process.off("unhandledRejection", handleUnhandledRejection);
  }
}

async function testSalesFunnelIntake() {
  const store = createEmbeddedStore();
  const recorded = [];
  const originalRecord = store.recordAppEvent?.bind(store);
  store.recordAppEvent = async (event) => {
    recorded.push(event);
    return originalRecord ? await originalRecord(event) : event;
  };
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "telemetry-test" })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    const accepted = await fetch(`${baseUrl}/commercial/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: "plan_selected",
        sessionId: "sales-session-123456",
        metadata: {
          planId: "starter-2",
          requestTrial: true,
          email: "must-not-be-recorded@example.com",
          cardNumber: "4111111111111111"
        }
      })
    });
    assert.equal(accepted.status, 202);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const funnelEvent = recorded.find((event) => event.type === "sales_funnel" && event.message === "plan_selected");
    assert.ok(funnelEvent);
    assert.equal(funnelEvent.metadata.planId, "starter-2");
    assert.equal(funnelEvent.metadata.requestTrial, true);
    assert.equal(funnelEvent.metadata.email, undefined);
    assert.equal(funnelEvent.metadata.cardNumber, undefined);

    const rejected = await fetch(`${baseUrl}/commercial/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: "arbitrary_event",
        sessionId: "sales-session-123456"
      })
    });
    assert.equal(rejected.status, 400);

    console.log("ok - funnel de Ventas acepta solo eventos y metadata permitidos");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

Promise.resolve()
  .then(testTelemetryIsolation)
  .then(testSalesFunnelIntake)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });