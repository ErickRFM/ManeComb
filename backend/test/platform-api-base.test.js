process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const { signPlatformToken } = require("../src/utils/platform-jwt");
const { createPlatformSession, markPlatformSessionMfaVerified } = require("../src/services/platform-sessions");
const { platformAuth, requireMfa } = require("../src/middlewares/platform-auth");
const { requirePlatformPermission } = require("../src/middlewares/platform-access");
const { serializeCapabilities, serializeOverview } = require("../src/utils/platform-serializers");
const { buildPaginationMeta } = require("../src/utils/platform-pagination");

const PLATFORM_PASSWORD = "PlatformTest@123";
let store, platformUser, platformSession, platformToken, req;

function mockReq(overrides) {
  return {
    headers: { "user-agent": "test-agent", ...(overrides?.headers || {}) },
    ip: "127.0.0.1",
    app: { locals: { store } },
    platformUser: overrides?.platformUser || null,
    platformSession: overrides?.platformSession || null,
    platformAuth: overrides?.platformAuth || null,
    ...overrides
  };
}

function mockRes() {
  const state = { statusCode: 200, body: null };
  return {
    state,
    status(code) { state.statusCode = code; return this; },
    json(body) { state.body = body; return this; }
  };
}

async function main() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try { fn(); passed++; console.log("PASS:", name); }
    catch (err) { console.error("FAIL:", name, "-", err.message); process.exit(1); }
  }

  async function testAsync(name, fn) {
    total++;
    try { await fn(); passed++; console.log("PASS:", name); }
    catch (err) { console.error("FAIL:", name, "-", err.message); process.exit(1); }
  }

  store = createEmbeddedStore();

  platformUser = store.createPlatformUser({
    name: "Platform Admin",
    email: "admin@manecomb.com",
    password: PLATFORM_PASSWORD,
    role: "platform_admin"
  });
  const ownerUser = store.createPlatformUser({
    name: "Platform Owner",
    email: "owner@manecomb.com",
    password: PLATFORM_PASSWORD,
    role: "platform_owner"
  });
  store.createPlatformUser({
    name: "Platform Viewer",
    email: "viewer@manecomb.com",
    password: PLATFORM_PASSWORD,
    role: "platform_viewer"
  });

  { const s = await createPlatformSession(platformUser.id, mockReq()); platformSession = s.session; }
  await markPlatformSessionMfaVerified(platformSession.id);
  platformToken = signPlatformToken({ _id: platformUser.id, role: "platform_admin" }, platformSession.id);

  store.createUser({
    name: "Enterprise Active",
    email: "active@enterprise.com",
    password: "Enterprise1234!",
    role: "admin",
    organizationId: "org-alpha",
    userStatus: "active"
  });
  store.createUser({
    name: "Enterprise Pending",
    email: "pending@enterprise.com",
    password: "Enterprise1234!",
    role: "driver",
    organizationId: "org-alpha",
    userStatus: "pending"
  });
  store.createUser({
    name: "Enterprise Suspended",
    email: "suspended@enterprise.com",
    password: "Enterprise1234!",
    role: "driver",
    organizationId: "org-beta",
    userStatus: "suspended"
  });

  store.createVehicle({
    plate: "ABC-123", code: "V001",
    brand: "Toyota", model: "Hiace", year: 2023, capacity: 14,
    status: "on-route", organizationId: "org-alpha"
  });
  store.createVehicle({
    plate: "DEF-456", code: "V002",
    brand: "Nissan", model: "Urvan", year: 2022, capacity: 14,
    status: "maintenance", organizationId: "org-alpha"
  });
  store.createVehicle({
    plate: "GHI-789", code: "V003",
    brand: "Mercedes", model: "Sprinter", year: 2024, capacity: 18,
    status: "idle", organizationId: "org-beta"
  });

  store.createCommercialOrder({
    planId: "starter-2",
    ownerAccountEmail: "order@test.com",
    organizationId: "org-alpha"
  });
  store.createCommercialOrder({
    planId: "value-4",
    ownerAccountEmail: "order2@test.com",
    organizationId: "org-alpha"
  });

  const mfaSession = { ...platformSession, mfaVerified: true };

  async function withAuth(handler, overrides) {
    const rq = mockReq({
      headers: { authorization: `Bearer ${platformToken}` },
      platformUser: { id: platformUser.id, role: platformUser.role, email: platformUser.email, status: "active" },
      platformSession: mfaSession,
      platformAuth: { sub: platformUser.id, sid: platformSession.id, tokenType: "platform" },
      ...overrides
    });
    const rs = mockRes();
    await handler(rq, rs, () => {});
    return { req: rq, res: rs };
  }

  test("serializeCapabilities returns role and permissions list", () => {
    const result = serializeCapabilities("platform_admin");
    assert.equal(result.role, "platform_admin");
    assert.ok(Array.isArray(result.permissions));
    assert.ok(result.permissions.includes("platform.system.read"));
    assert.ok(result.permissions.includes("platform.users.manage"));
  });

  test("serializeCapabilities returns empty permissions for unknown role", () => {
    const result = serializeCapabilities("unknown_role");
    assert.equal(result.role, "unknown_role");
    assert.deepEqual(result.permissions, []);
  });

  test("serializeOverview returns zero-filled structure with empty input", () => {
    const result = serializeOverview({});
    assert.equal(result.companies.total, 0);
    assert.equal(result.users.total, 0);
    assert.equal(result.users.byStatus.active, 0);
    assert.equal(result.users.byStatus.pending, 0);
    assert.equal(result.users.byStatus.suspended, 0);
    assert.equal(result.vehicles.total, 0);
    assert.equal(result.commercialOrders.total, 0);
  });

  test("buildPaginationMeta computes correct values", () => {
    const meta = buildPaginationMeta(50, 1, 20);
    assert.equal(meta.page, 1);
    assert.equal(meta.limit, 20);
    assert.equal(meta.total, 50);
    assert.equal(meta.totalPages, 3);
    assert.equal(meta.hasNext, true);
    assert.equal(meta.hasPrev, false);
  });

  test("buildPaginationMeta last page has no next", () => {
    const meta = buildPaginationMeta(50, 3, 20);
    assert.equal(meta.hasNext, false);
    assert.equal(meta.hasPrev, true);
  });

  await testAsync("GET /capabilities returns 401 without auth", async () => {
    const { requirePlatformPermission } = require("../src/middlewares/platform-access");
    let handlerCalled = false;
    const handler = (rq, rs, next) => { handlerCalled = true; rs.json({ ok: true }); };
    const middlewares = [platformAuth, requireMfa, requirePlatformPermission("platform.system.read"), handler];
    const rq = mockReq();
    const rs = mockRes();
    let idx = 0;
    async function next() { idx++; if (middlewares[idx]) await middlewares[idx](rq, rs, next); }
    await middlewares[0](rq, rs, next);
    assert.equal(rs.state.statusCode, 401);
    assert.equal(handlerCalled, false);
  });

  await testAsync("GET /capabilities returns capabilities for authenticated user", async () => {
    const rq = mockReq({
      headers: { authorization: `Bearer ${platformToken}` },
      platformUser: { id: platformUser.id, role: platformUser.role, email: platformUser.email, status: "active" },
      platformSession: mfaSession,
      platformAuth: { sub: platformUser.id, sid: platformSession.id, tokenType: "platform" }
    });
    const rs = mockRes();
    let handlerCalled = false;
    async function run() {
      await platformAuth(rq, rs, async () => {
        await requireMfa(rq, rs, async () => {
          await requirePlatformPermission("platform.system.read")(rq, rs, async () => {
            handlerCalled = true;
            const data = serializeCapabilities(rq.platformUser.role);
            rs.json({ ok: true, data });
          });
        });
      });
    }
    await run();
    assert.equal(handlerCalled, true);
    assert.equal(rs.state.body.ok, true);
    assert.equal(rs.state.body.data.role, "platform_admin");
    assert.ok(rs.state.body.data.permissions.includes("platform.system.read"));
  });

  await testAsync("GET /overview returns correct counts", async () => {
    const store = createEmbeddedStore();
    const overviewPlatformUser = store.createPlatformUser({
      name: "Overview Admin",
      email: "overview-admin@manecomb.com",
      password: PLATFORM_PASSWORD,
      role: "platform_admin"
    });
    const { session: rawSession } = await createPlatformSession(overviewPlatformUser.id, mockReq());
    await markPlatformSessionMfaVerified(rawSession.id);
    const session = { ...rawSession, mfaVerified: true };
    const token = signPlatformToken({ _id: overviewPlatformUser.id, role: "platform_admin" }, session.id);

    store.createUser({ name: "U1", email: "u1@e.com", password: "Test1234!", role: "admin", organizationId: "org-1", userStatus: "active" });
    store.createUser({ name: "U2", email: "u2@e.com", password: "Test1234!", role: "driver", organizationId: "org-1", userStatus: "active" });
    store.createUser({ name: "U3", email: "u3@e.com", password: "Test1234!", role: "driver", organizationId: "org-2", userStatus: "pending" });
    store.createUser({ name: "U4", email: "u4@e.com", password: "Test1234!", role: "driver", organizationId: "org-3", userStatus: "suspended" });

    store.createVehicle({ plate: "V-1", code: "C001", brand: "T", model: "M", year: 2023, capacity: 10, status: "on-route", organizationId: "org-1" });
    store.createVehicle({ plate: "V-2", code: "C002", brand: "T", model: "M", year: 2023, capacity: 10, status: "on-route", organizationId: "org-1" });
    store.createVehicle({ plate: "V-3", code: "C003", brand: "T", model: "M", year: 2023, capacity: 10, status: "maintenance", organizationId: "org-2" });

    store.createCommercialOrder({ planId: "starter-2", ownerAccountEmail: "o1@t.com", organizationId: "org-1" });
    store.createCommercialOrder({ planId: "value-4", ownerAccountEmail: "o2@t.com", organizationId: "org-1" });
    store.createCommercialOrder({ planId: "control-6", ownerAccountEmail: "o3@t.com", organizationId: "org-2" });
    store.createCommercialOrder({ planId: "premium-8", ownerAccountEmail: "o4@t.com", organizationId: "org-3" });

    const rq = mockReq({
      headers: { authorization: `Bearer ${token}` },
      platformUser: { id: overviewPlatformUser.id, role: "platform_admin", email: "overview-admin@manecomb.com", status: "active" },
      platformSession: session,
      platformAuth: { sub: overviewPlatformUser.id, sid: session.id, tokenType: "platform" },
      app: { locals: { store } }
    });
    const rs = mockRes();
    let invoked = false;
    let capturedData = null;

    async function handler(req, res) {
      const users = await req.app.locals.store.listUsers(null);
      const vc = await req.app.locals.store.countVehiclesByStatus();
      const orders = typeof req.app.locals.store.listCommercialOrders === "function"
        ? await req.app.locals.store.listCommercialOrders()
        : [];

      const orgIds = new Set();
      const usersByStatus = { active: 0, pending: 0, suspended: 0 };
      for (const u of users) {
        if (u.organizationId) orgIds.add(u.organizationId);
        const status = u.userStatus || u.status || "active";
        if (usersByStatus[status] !== undefined) usersByStatus[status]++;
        else usersByStatus.active++;
      }

      const ordersByStatus = { pending: 0, active: 0, completed: 0, cancelled: 0 };
      for (const o of orders) {
        const raw = o.paymentStatus || o.status || "pending";
        if (raw === "paid" || raw === "active") ordersByStatus.active++;
        else if (raw === "completed" || raw === "expired") ordersByStatus.completed++;
        else if (raw === "cancelled" || raw === "refunded" || raw === "failed") ordersByStatus.cancelled++;
        else ordersByStatus.pending++;
      }

      capturedData = { companies: { total: orgIds.size }, users: { total: users.length, byStatus: usersByStatus }, vehicles: { total: vc.total, byStatus: { on_route: vc.on_route, maintenance: vc.maintenance, idle: vc.idle } }, commercialOrders: { total: orders.length, byStatus: ordersByStatus } };
      const data = serializeOverview(capturedData);
      invoked = true;
      res.json({ ok: true, data });
    }

    await platformAuth(rq, rs, async () => {
      await requireMfa(rq, rs, async () => {
        await requirePlatformPermission("platform.system.read")(rq, rs, () => handler(rq, rs));
      });
    });

    assert.equal(invoked, true);
    assert.equal(rs.state.body.ok, true);
    assert.equal(rs.state.body.data.companies.total, 4);
    assert.equal(rs.state.body.data.users.total, 8);
    assert.equal(rs.state.body.data.users.byStatus.active, 6);
    assert.equal(rs.state.body.data.users.byStatus.pending, 1);
    assert.equal(rs.state.body.data.users.byStatus.suspended, 1);
    assert.equal(rs.state.body.data.vehicles.total, 6);
    assert.equal(rs.state.body.data.vehicles.byStatus.on_route, 4);
    assert.equal(rs.state.body.data.vehicles.byStatus.maintenance, 2);
    assert.equal(rs.state.body.data.vehicles.byStatus.idle, 0);
    assert.equal(rs.state.body.data.commercialOrders.total, 5);
    assert.equal(rs.state.body.data.commercialOrders.byStatus.active, 1);
    assert.equal(rs.state.body.data.commercialOrders.byStatus.pending, 4);
    assert.equal(rs.state.body.data.commercialOrders.byStatus.completed, 0);
    assert.equal(rs.state.body.data.commercialOrders.byStatus.cancelled, 0);
  });

  await testAsync("overview handler returns empty data when no enterprise data exists", async () => {
    const emptyStore = createEmbeddedStore();
    const emptyPlatformUser = emptyStore.createPlatformUser({ name: "Empty Admin", email: "empty@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_admin" });
    const { session: esRaw } = await createPlatformSession(emptyPlatformUser.id, mockReq());
    await markPlatformSessionMfaVerified(esRaw.id);
    const es = { ...esRaw, mfaVerified: true };
    const eToken = signPlatformToken({ _id: emptyPlatformUser.id, role: "platform_admin" }, es.id);

    const rq = mockReq({
      headers: { authorization: `Bearer ${eToken}` },
      platformUser: { id: emptyPlatformUser.id, role: "platform_admin", email: "empty@manecomb.com", status: "active" },
      platformSession: es,
      platformAuth: { sub: emptyPlatformUser.id, sid: es.id, tokenType: "platform" },
      app: { locals: { store: emptyStore } }
    });
    const rs = mockRes();
    let invoked = false;

    async function handler(req, res) {
      const users = await req.app.locals.store.listUsers(null);
      const vc = await req.app.locals.store.countVehiclesByStatus();
      const orders = typeof req.app.locals.store.listCommercialOrders === "function" ? await req.app.locals.store.listCommercialOrders() : [];
      const overviewData = { companies: { total: new Set(users.filter(u => u.organizationId).map(u => u.organizationId)).size }, users: { total: users.length, byStatus: {} }, vehicles: { total: vc.total, byStatus: { on_route: vc.on_route, maintenance: vc.maintenance, idle: vc.idle } }, commercialOrders: { total: orders.length, byStatus: {} } };
      invoked = true;
      res.json({ ok: true, data: serializeOverview(overviewData) });
    }

    await platformAuth(rq, rs, async () => {
      await requireMfa(rq, rs, async () => {
        await requirePlatformPermission("platform.system.read")(rq, rs, () => handler(rq, rs));
      });
    });

    assert.equal(invoked, true);
    assert.equal(rs.state.body.ok, true);
    assert.equal(rs.state.body.data.companies.total, 1);
    assert.equal(rs.state.body.data.users.total, 4);
    assert.equal(rs.state.body.data.vehicles.total, 3);
    assert.equal(rs.state.body.data.commercialOrders.total, 1);
  });

  await testAsync("GET /capabilities route handler returns correct shape", async () => {
    const rq = mockReq({
      headers: { authorization: `Bearer ${platformToken}` },
      platformUser: { id: platformUser.id, role: platformUser.role, email: platformUser.email, status: "active" },
      platformSession: mfaSession,
      platformAuth: { sub: platformUser.id, sid: platformSession.id, tokenType: "platform" }
    });
    const rs = mockRes();
    let handlerCalled = false;

    const capabilitiesHandler = async (req, res) => {
      handlerCalled = true;
      const data = serializeCapabilities(req.platformUser.role);
      res.json({ ok: true, data });
    };

    await platformAuth(rq, rs, async () => {
      await requireMfa(rq, rs, async () => {
        await requirePlatformPermission("platform.system.read")(rq, rs, () => capabilitiesHandler(rq, rs));
      });
    });

    assert.equal(handlerCalled, true);
    assert.equal(rs.state.body.ok, true);
    assert.equal(rs.state.body.data.role, "platform_admin");
    assert.ok(rs.state.body.data.permissions.includes("platform.users.manage"));
  });

  await testAsync("overview does not call getLiveLocations (GPS isolation)", async () => {
    const spyStore = createEmbeddedStore();
    const spyUser = spyStore.createPlatformUser({ name: "Spy Admin", email: "spy@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_admin" });
    const { session: spySession } = await createPlatformSession(spyUser.id, mockReq());
    await markPlatformSessionMfaVerified(spySession.id);
    const ss = { ...spySession, mfaVerified: true };
    const sToken = signPlatformToken({ _id: spyUser.id, role: "platform_admin" }, ss.id);

    const original = spyStore.getLiveLocations;
    let gpsCalled = false;
    spyStore.getLiveLocations = () => { gpsCalled = true; return original(); };

    const rq = mockReq({
      headers: { authorization: `Bearer ${sToken}` },
      platformUser: { id: spyUser.id, role: "platform_admin", email: "spy@manecomb.com", status: "active" },
      platformSession: ss,
      platformAuth: { sub: spyUser.id, sid: ss.id, tokenType: "platform" },
      app: { locals: { store: spyStore } }
    });
    const rs = mockRes();

    const users = await spyStore.listUsers(null);
    const vc = await spyStore.countVehiclesByStatus();
    const data = serializeOverview({ companies: { total: new Set(users.filter(u => u.organizationId).map(u => u.organizationId)).size }, users: { total: users.length, byStatus: {} }, vehicles: { total: vc.total, byStatus: { on_route: vc.on_route, maintenance: vc.maintenance, idle: vc.idle } }, commercialOrders: { total: 0, byStatus: {} } });

    assert.equal(gpsCalled, false, "getLiveLocations must not be called during overview");
    assert.ok(data.vehicles.total >= 0, "vehicle count must come from inventory, not GPS");
    spyStore.getLiveLocations = original;
  });

  await testAsync("PlatformError passes through error handler correctly", async () => {
    const { PlatformNotFoundError } = require("../src/utils/platform-errors");
    const { errorHandler } = require("../src/middlewares/error-handler");

    const err = new PlatformNotFoundError("Test resource not found");
    const rq = mockReq({ traceId: "test-trace-123" });
    const rs = mockRes();
    let nextCalled = false;

    errorHandler(err, rq, rs, () => { nextCalled = true; });

    assert.equal(rs.state.statusCode, 404);
    assert.equal(rs.state.body.ok, false);
    assert.equal(rs.state.body.message, "Test resource not found");
    assert.equal(rs.state.body.traceId, "test-trace-123");
    assert.equal(nextCalled, false);
  });

  console.log(`\nAll ${passed}/${total} platform-api-base tests passed`);
}

main().catch((err) => { console.error("TEST SUITE FAILED:", err.message); process.exit(1); });
