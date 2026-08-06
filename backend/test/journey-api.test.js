const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");

async function request(baseUrl, token, path, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  return {
    status: response.status,
    data: await response.json()
  };
}

async function main() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const adminToken = signToken(store.getUserById("user-admin-01"));

  try {
    const started = await request(baseUrl, adminToken, "/navigation/sessions/start", "POST", {
      vehicleId: "vehicle-101"
    });
    assert.ok([200, 201].includes(started.status));
    const sessionId = started.data.data.id;

    const read = await request(baseUrl, adminToken, `/journeys/${sessionId}`);
    assert.equal(read.status, 200);
    assert.equal(read.data.data.id, sessionId);
    assert.equal(read.data.data.status, "RUNNING");
    assert.equal(read.data.data.startedAt, started.data.data.startedAt);

    const paused = await request(baseUrl, adminToken, `/journeys/${sessionId}/transition`, "POST", {
      status: "PAUSED"
    });
    assert.equal(paused.status, 200);
    assert.equal(paused.data.applied, true);
    assert.equal(paused.data.data.status, "PAUSED");
    assert.ok(paused.data.data.pausedAt);

    const duplicatePause = await request(baseUrl, adminToken, `/journeys/${sessionId}/transition`, "POST", {
      status: "PAUSED"
    });
    assert.equal(duplicatePause.status, 200);
    assert.equal(duplicatePause.data.applied, false);
    assert.equal(duplicatePause.data.idempotent, true);

    const resumed = await request(baseUrl, adminToken, `/journeys/${sessionId}/transition`, "POST", {
      status: "RUNNING"
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.data.status, "RUNNING");
    assert.ok(resumed.data.data.resumedAt);

    const invalid = await request(baseUrl, adminToken, `/journeys/${sessionId}/transition`, "POST", {
      status: "READY"
    });
    assert.equal(invalid.status, 409);
    assert.equal(invalid.data.code, "invalid_transition");

    console.log("journey-api.test.js: OK");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
