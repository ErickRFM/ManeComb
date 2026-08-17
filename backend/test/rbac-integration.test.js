const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const createApp = require("../src/app");
const { ROLE_PERMISSIONS, hasPermission } = require("../src/middlewares/access-control");
const { resolveAuthenticatedUser } = require("../src/middlewares/authenticate");
const { requirePortalAccess } = require("../src/middlewares/portal-access");
const { createEmbeddedStore } = require("../src/data/store");
const { createSessionForRequest, revokeSession } = require("../src/services/sessions");
const { signToken } = require("../src/utils/jwt");

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

async function createContext() {
  const store = createEmbeddedStore();
  const originalListOrders = store.listCommercialOrdersForUser;
  store.listCommercialOrdersForUser = async (user) => [{
    id: `rbac-order-${user.organizationId}`,
    planId: "control-6",
    planName: "Control 6",
    fleetSize: 6,
    organizationId: user.organizationId,
    ownerUserId: user.id,
    paymentStatus: "paid",
    activationStatus: "active",
    status: "active",
    currentPeriodEnd: futureDate,
    createdAt: new Date().toISOString()
  }];
  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    store,
    originalListOrders,
    url: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function request(context, user, path, method = "GET", body) {
  const response = await fetch(`${context.url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${signToken(user)}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

async function main() {
  assert.deepEqual(ROLE_PERMISSIONS.admin.includes("canManageUsers"), true);
  assert.deepEqual(ROLE_PERMISSIONS.supervisor.includes("canManageUsers"), false);
  assert.deepEqual(ROLE_PERMISSIONS.driver, ["canAccessRTC"]);

  const socketSource = fs.readFileSync(path.join(__dirname, "../src/sockets/index.js"), "utf8");
  assert.match(socketSource, /resolveAuthenticatedUser\(store, token\)/);
  assert.match(socketSource, /socket\.on\("chat:typing"[\s\S]*authenticatedUser\.id[\s\S]*canUserAccessConversation/);
  assert.doesNotMatch(socketSource, /socket\.on\("chat:typing",[^]*\{ conversationId, userId, userName \}/);
  assert.match(socketSource, /ingestVehicleLocation/);
  const locationIngestionSource = fs.readFileSync(
    path.join(__dirname, "../src/services/vehicle-location-ingestion.js"),
    "utf8"
  );
  assert.match(locationIngestionSource, /emitOperationalUnitUpdate\s*\(\s*\{/);
  assert.match(locationIngestionSource, /getRolesWithPermission/);

  const context = await createContext();
  try {
    const admin = context.store.getUserById("user-admin-01");
    const supervisor = context.store.getUserById("user-supervisor-01");
    const driver = context.store.getUserById("user-driver-01");

    assert.equal(hasPermission(admin, "canManageUsers"), true);
    assert.equal(hasPermission(supervisor, "canViewAnalytics"), true);
    assert.equal(hasPermission(driver, "canViewAnalytics"), false);

    assert.equal((await request(context, supervisor, "/users")).status, 200);
    assert.equal((await request(context, driver, "/users")).status, 403);
    assert.equal((await request(context, supervisor, "/users", "POST", {
      name: "No autorizado",
      email: "blocked-rbac@manecomb.test",
      role: "driver"
    })).status, 403);

    let portalAllowed = false;
    requirePortalAccess(
      { user: { ...admin, accountType: "company_owner", role: "owner" } },
      { status: () => ({ json: () => undefined }) },
      () => { portalAllowed = true; }
    );
    assert.equal(portalAllowed, true);
    portalAllowed = false;
    requirePortalAccess(
      { user: supervisor },
      { status: () => ({ json: () => undefined }) },
      () => { portalAllowed = true; }
    );
    assert.equal(portalAllowed, false);

    const incident = (await request(context, driver, "/incidents")).data.data[0];
    assert.ok(incident, "seed debe incluir una incidencia accesible");
    assert.equal((await request(context, driver, `/incidents/${incident.id}/status`, "PATCH", {
      status: "resolved"
    })).status, 403);

    const createdSession = await createSessionForRequest({ headers: {}, ip: "127.0.0.1" }, supervisor);
    const sessionToken = signToken(supervisor, createdSession.session.id);
    assert.equal((await resolveAuthenticatedUser(context.store, sessionToken)).user.id, supervisor.id);
    await revokeSession(supervisor.id, createdSession.session.id, "rbac_test");
    assert.equal(await resolveAuthenticatedUser(context.store, sessionToken), null);

    await context.store.updateUser(supervisor.id, { userStatus: "suspended" });
    assert.equal(await resolveAuthenticatedUser(context.store, signToken(supervisor)), null);

    console.log("ok - matriz, Portal, revocacion y suspension aplicados por la autorizacion compartida");
  } finally {
    context.store.listCommercialOrdersForUser = context.originalListOrders;
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
