const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { processCompletedRouteSession } = require("../src/services/auto-route-learning");
const { signToken } = require("../src/utils/jwt");

async function main() {
  const store = createEmbeddedStore();
  const session = await store.createRouteSession({
    organizationId: "manecomb-demo", routeId: "recording:vehicle-101", vehicleId: "vehicle-101",
    driverId: "user-driver-01", startedAt: new Date().toISOString()
  });
  await store.updateRouteSession(session.id, { expectedStatus: "RUNNING", status: "FINISHED" });
  assert.deepEqual(await processCompletedRouteSession(store, session.id), {
    processed: false, reason: "learning_disabled"
  });
  assert.equal((await store.listLearnedRouteCandidates({ organizationId: "manecomb-demo" })).length, 0);

  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/navigation/learned-routes`, {
      headers: { Authorization: `Bearer ${signToken(store.getUserById("user-admin-01"))}` }
    });
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.code, "auto_route_review_disabled");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  console.log("auto route feature flags tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
