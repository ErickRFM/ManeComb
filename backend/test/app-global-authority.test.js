const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");

async function createContext() {
  const store = createEmbeddedStore();
  const driver = await store.createUser({
    name: "Driver App Stats Guard",
    email: `driver-app-stats-${Date.now()}@manecomb.test`,
    password: "Ruta123!",
    role: "driver",
    accountType: "operations",
    organizationId: "manecomb-demo",
    companyId: "manecomb-demo",
    userStatus: "active",
    status: "offline"
  });
  const operationalAdmin = await store.createUser({
    name: "Operational App Stats Admin",
    email: `ops-admin-app-stats-${Date.now()}@manecomb.test`,
    password: "Ruta123!",
    role: "admin",
    accountType: "operations",
    organizationId: "manecomb-demo",
    companyId: "manecomb-demo",
    userStatus: "active",
    status: "offline"
  });
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "app-global-authority-test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api`,
    driverToken: signToken(driver),
    adminToken: signToken(operationalAdmin),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

async function getStats(baseUrl, token) {
  const response = await fetch(`${baseUrl}/app/device-stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return { response, payload: await response.json() };
}

async function main() {
  const context = await createContext();
  try {
    const driverResult = await getStats(context.baseUrl, context.driverToken);
    assert.equal(driverResult.response.status, 403);
    assert.equal(driverResult.payload.ok, false);

    const adminResult = await getStats(context.baseUrl, context.adminToken);
    assert.equal(adminResult.response.status, 200);
    assert.equal(adminResult.payload.ok, true);
    assert.equal(typeof adminResult.payload.data.total, "number");

    console.log("ok - app global device statistics authority");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
