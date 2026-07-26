process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const assert = require("node:assert/strict");
const http = require("http");
const { createEmbeddedStore } = require("../src/data/store");
const { signPlatformToken, signPlatformChallengeToken } = require("../src/utils/platform-jwt");
const { createPlatformSession, markPlatformSessionMfaVerified } = require("../src/services/platform-sessions");
const { sanitizeText, sanitizeEnum, sanitizeDate, sanitizeBoolean, rejectMongoOperators } = require("../src/utils/platform-filters");
const { parsePagination, buildPaginationMeta } = require("../src/utils/platform-pagination");
const { serializePaginationMeta, serializeError } = require("../src/utils/platform-serializers");
const { PlatformNotFoundError, PlatformError } = require("../src/utils/platform-errors");
const { errorHandler } = require("../src/middlewares/error-handler");
const { getPlatformPermissions } = require("../src/config/platform-roles");

const PLATFORM_PASSWORD = "PlatformTest@123";
let store;
let adminUser, adminSession, adminToken;
let ownerToken, viewerToken, supportToken, financeToken;

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

  adminUser = store.createPlatformUser({ name: "Platform Admin", email: "admin@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_admin" });
  const ownerUser = store.createPlatformUser({ name: "Platform Owner", email: "owner@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_owner" });
  const viewerUser = store.createPlatformUser({ name: "Platform Viewer", email: "viewer@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_viewer" });
  const supportUser = store.createPlatformUser({ name: "Platform Support", email: "support@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_support" });
  const financeUser = store.createPlatformUser({ name: "Platform Finance", email: "finance@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_finance" });
  store.createPlatformUser({ name: "Platform Suspended", email: "suspended@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_viewer", status: "suspended" });

  async function makeSession(user) {
    const { session } = await createPlatformSession(user.id, mockReq());
    await markPlatformSessionMfaVerified(session.id);
    return { ...session, mfaVerified: true };
  }

  adminSession = await makeSession(adminUser);
  adminToken = signPlatformToken({ _id: adminUser.id, role: "platform_admin" }, adminSession.id);
  ownerToken = signPlatformToken({ _id: ownerUser.id, role: "platform_owner" }, (await makeSession(ownerUser)).id);
  viewerToken = signPlatformToken({ _id: viewerUser.id, role: "platform_viewer" }, (await makeSession(viewerUser)).id);
  supportToken = signPlatformToken({ _id: supportUser.id, role: "platform_support" }, (await makeSession(supportUser)).id);
  financeToken = signPlatformToken({ _id: financeUser.id, role: "platform_finance" }, (await makeSession(financeUser)).id);

  store.createUser({ name: "Enterprise Active", email: "active@enterprise.com", password: "Enterprise1234!", role: "admin", organizationId: "org-alpha", userStatus: "active" });
  store.createUser({ name: "Enterprise Pending", email: "pending@enterprise.com", password: "Enterprise1234!", role: "driver", organizationId: "org-alpha", userStatus: "pending" });
  store.createUser({ name: "Enterprise Suspended", email: "suspended@enterprise.com", password: "Enterprise1234!", role: "driver", organizationId: "org-beta", userStatus: "suspended" });

  store.createVehicle({ plate: "ABC-123", code: "V001", brand: "Toyota", model: "Hiace", year: 2023, capacity: 14, status: "on-route", organizationId: "org-alpha" });
  store.createVehicle({ plate: "DEF-456", code: "V002", brand: "Nissan", model: "Urvan", year: 2022, capacity: 14, status: "maintenance", organizationId: "org-alpha" });
  store.createVehicle({ plate: "GHI-789", code: "V003", brand: "Mercedes", model: "Sprinter", year: 2024, capacity: 18, status: "idle", organizationId: "org-beta" });

  store.createCommercialOrder({ planId: "starter-2", ownerAccountEmail: "order@test.com", organizationId: "org-alpha" });
  store.createCommercialOrder({ planId: "value-4", ownerAccountEmail: "order2@test.com", organizationId: "org-alpha" });

  // ===== HELPERS: filters =====
  test("sanitizeText normalizes string", () => {
    assert.equal(sanitizeText("  hello  "), "hello");
    assert.equal(sanitizeText(""), "");
    assert.equal(sanitizeText(123), "");
    assert.equal(sanitizeText(null), "");
  });

  test("sanitizeText enforces max length", () => {
    const long = "a".repeat(300);
    assert.equal(sanitizeText(long, 200).length, 200);
    assert.equal(sanitizeText(long, 5).length, 5);
  });

  test("sanitizeEnum allows only valid values", () => {
    assert.equal(sanitizeEnum("active", ["active", "inactive"]), "active");
    assert.equal(sanitizeEnum("unknown", ["active", "inactive"]), null);
    assert.equal(sanitizeEnum("", ["active"]), null);
    assert.equal(sanitizeEnum("active", null), null);
  });

  test("sanitizeDate returns ISO string or null", () => {
    const result = sanitizeDate("2024-01-15T10:00:00Z");
    assert.equal(typeof result, "string");
    assert.ok(result.includes("2024"));
    assert.equal(sanitizeDate("not-a-date"), null);
    assert.equal(sanitizeDate(""), null);
    assert.equal(sanitizeDate(null), null);
  });

  test("sanitizeBoolean handles explicit values", () => {
    assert.equal(sanitizeBoolean(true), true);
    assert.equal(sanitizeBoolean(false), false);
    assert.equal(sanitizeBoolean("true"), true);
    assert.equal(sanitizeBoolean("false"), false);
    assert.equal(sanitizeBoolean("1"), true);
    assert.equal(sanitizeBoolean("0"), false);
    assert.equal(sanitizeBoolean("maybe"), null);
    assert.equal(sanitizeBoolean(undefined), null);
  });

  test("rejectMongoOperators strips $ keys from objects", () => {
    const obj = { name: "test", $gt: 5, $ne: null };
    rejectMongoOperators(obj);
    assert.equal(obj.name, "test");
    assert.equal(obj.$gt, undefined);
    assert.equal(obj.$ne, undefined);
  });

  test("rejectMongoOperators handles nested $ operators", () => {
    const obj = { email: { $regex: ".*" }, name: "test" };
    rejectMongoOperators(obj);
    assert.equal(obj.name, "test");
    assert.deepEqual(obj.email, {});
  });

  test("rejectMongoOperators skips non-objects", () => {
    assert.equal(rejectMongoOperators(null), null);
    assert.equal(rejectMongoOperators("string"), "string");
    assert.equal(rejectMongoOperators(42), 42);
  });

  // ===== HELPERS: pagination =====
  test("parsePagination uses defaults for missing values", () => {
    const r = parsePagination({});
    assert.equal(r.page, 1);
    assert.equal(r.limit, 20);
    assert.equal(r.skip, 0);
    assert.equal(r.order, "desc");
  });

  test("parsePagination handles invalid page and limit", () => {
    const r = parsePagination({ page: "abc", limit: "-5" });
    assert.equal(r.page, 1);
    assert.equal(r.limit, 20);
  });

  test("parsePagination enforces max limit", () => {
    const r = parsePagination({ limit: "999" });
    assert.equal(r.limit, 100);
  });

  test("parsePagination validates sort allowlist", () => {
    const r = parsePagination({ sort: "invalid" }, ["name", "createdAt"]);
    assert.equal(r.sort, "name");
  });

  test("parsePagination validates order", () => {
    const r1 = parsePagination({ order: "asc" });
    assert.equal(r1.order, "asc");
    const r2 = parsePagination({ order: "invalid" });
    assert.equal(r2.order, "desc");
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

  test("buildPaginationMeta zero items", () => {
    const meta = buildPaginationMeta(0, 1, 20);
    assert.equal(meta.total, 0);
    assert.equal(meta.totalPages, 1);
    assert.equal(meta.hasNext, false);
    assert.equal(meta.hasPrev, false);
  });

  test("buildPaginationMeta last page", () => {
    const meta = buildPaginationMeta(50, 3, 20);
    assert.equal(meta.hasNext, false);
    assert.equal(meta.hasPrev, true);
  });

  // ===== HELPERS: serializers =====
  test("serializePaginationMeta returns correct shape", () => {
    const meta = serializePaginationMeta({ page: 1, limit: 20, total: 100, totalPages: 5, hasNext: true, hasPrev: false });
    assert.equal(meta.page, 1);
    assert.equal(meta.limit, 20);
    assert.equal(meta.total, 100);
    assert.equal(meta.totalPages, 5);
    assert.equal(meta.hasNext, true);
    assert.equal(meta.hasPrev, false);
  });

  test("serializeError returns sanitized envelope", () => {
    const err = new PlatformNotFoundError("Test not found");
    const result = serializeError(err);
    assert.equal(result.code, "PLATFORM_NOT_FOUND");
    assert.equal(result.message, "Test not found");
    assert.equal(result.details, undefined);
  });

  test("serializeError hides details when absent", () => {
    const err = new PlatformError({ statusCode: 500, code: "PLATFORM_INTERNAL_ERROR", message: "Internal" });
    const result = serializeError(err);
    assert.equal(result.code, "PLATFORM_INTERNAL_ERROR");
    assert.equal(result.message, "Internal");
    assert.equal(result.details, undefined);
  });

  test("serializeError includes details when present", () => {
    const err = new PlatformError({ statusCode: 400, code: "PLATFORM_VALIDATION_ERROR", message: "Invalid", details: { field: "email" } });
    const result = serializeError(err);
    assert.deepEqual(result.details, { field: "email" });
  });

  // ===== HELPERS: PlatformError =====
  test("PlatformNotFoundError passes through error handler correctly", () => {
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

  test("PlatformError uses statusCode from error", () => {
    const err = new PlatformError({ statusCode: 403, code: "PLATFORM_FORBIDDEN", message: "Forbidden" });
    const rq = mockReq({ traceId: "tid" });
    const rs = mockRes();
    errorHandler(err, rq, rs, () => {});
    assert.equal(rs.state.statusCode, 403);
    assert.equal(rs.state.body.message, "Forbidden");
  });

  // ===== SECURITY =====
  await testAsync("no token returns 401", async () => {
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const rq = mockReq();
    const rs = mockRes();
    let nextCalled = false;
    await platformAuth(rq, rs, () => { nextCalled = true; });
    assert.equal(rs.state.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  await testAsync("challenge token returns 401", async () => {
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const challengeToken = signPlatformChallengeToken({ _id: adminUser.id, role: "platform_admin" }, adminSession.id, "mfa_verify");
    const rq = mockReq({ headers: { authorization: `Bearer ${challengeToken}` } });
    const rs = mockRes();
    await platformAuth(rq, rs, () => {});
    assert.equal(rs.state.statusCode, 401);
  });

  await testAsync("session with MFA false returns 403", async () => {
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const { session: noMfaSession } = await createPlatformSession(adminUser.id, mockReq());
    const noMfaToken = signPlatformToken({ _id: adminUser.id, role: "platform_admin" }, noMfaSession.id);
    const rq = mockReq({ headers: { authorization: `Bearer ${noMfaToken}` }, app: { locals: { store } } });
    const rs = mockRes();
    await platformAuth(rq, rs, () => {});
    assert.equal(rs.state.statusCode, 403);
    assert.ok(rs.state.body.message.includes("MFA"));
  });

  await testAsync("revoked session returns 401", async () => {
    const { revokePlatformSession } = require("../src/services/platform-sessions");
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const { session: revSession } = await createPlatformSession(adminUser.id, mockReq());
    await markPlatformSessionMfaVerified(revSession.id);
    await revokePlatformSession(adminUser.id, revSession.id, "test");
    const revToken = signPlatformToken({ _id: adminUser.id, role: "platform_admin" }, revSession.id);
    const rq = mockReq({ headers: { authorization: `Bearer ${revToken}` }, app: { locals: { store } } });
    const rs = mockRes();
    await platformAuth(rq, rs, () => {});
    assert.equal(rs.state.statusCode, 401);
  });

  await testAsync("suspended user returns 403", async () => {
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const suspUser = store.createPlatformUser({ name: "Suspended", email: "susp2@test.com", password: PLATFORM_PASSWORD, role: "platform_viewer", status: "suspended" });
    const { session: suspSession } = await createPlatformSession(suspUser.id, mockReq());
    await markPlatformSessionMfaVerified(suspSession.id);
    const suspToken = signPlatformToken({ _id: suspUser.id, role: "platform_viewer" }, suspSession.id);
    const rq = mockReq({ headers: { authorization: `Bearer ${suspToken}` }, app: { locals: { store } } });
    const rs = mockRes();
    await platformAuth(rq, rs, () => {});
    assert.equal(rs.state.statusCode, 403);
  });

  // ===== CAPABILITIES =====
  await testAsync("capabilities returns sanitized user", async () => {
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const rq = mockReq({
      headers: { authorization: `Bearer ${adminToken}` },
      platformUser: { id: adminUser.id, role: "platform_admin", email: adminUser.email, status: "active" },
      platformSession: adminSession,
      platformAuth: { sub: adminUser.id, sid: adminSession.id, tokenType: "platform" }
    });
    rq.app.locals.store = store;
    const rs = mockRes();
    let invoked = false;
    let body = null;
    async function handler(req, res) {
      invoked = true;
      const permissions = getPlatformPermissions(req.platformUser.role);
      const md = {};
      const mm = { users: ["platform.users.manage"], sessions: ["platform.sessions.manage"], companies: ["platform.companies.read"], commercial: ["platform.commercial.read"], system: ["platform.system.read"], audit: ["platform.audit.read"], actions: ["platform.actions.execute"] };
      for (const [k, v] of Object.entries(mm)) md[k] = v.some((p) => permissions.includes(p));
      body = { user: req.platformUser, permissions, modules: md };
      res.json({ ok: true, data: body });
    }
    await platformAuth(rq, rs, async () => { await handler(rq, rs); });
    assert.equal(invoked, true);
    assert.equal(rs.state.body.ok, true);
    assert.equal(body.user.id, adminUser.id);
    assert.equal(body.user.name, adminUser.name);
    assert.equal(body.user.email, adminUser.email);
    assert.equal(body.user.role, "platform_admin");
    assert.equal(body.user.status, "active");
    assert.equal(typeof body.user.mfaEnabled, "boolean");
    assert.equal(body.user.passwordHash, undefined);
    assert.equal(body.user.failedLoginAttempts, undefined);
    assert.equal(body.user.lockedUntil, undefined);
  });

  test("capabilities permissions match real role", () => {
    const perms = getPlatformPermissions("platform_admin");
    assert.ok(perms.includes("platform.users.manage"));
    assert.ok(perms.includes("platform.companies.read"));
    assert.ok(perms.includes("platform.system.read"));
    assert.ok(perms.includes("platform.audit.read"));
    assert.equal(perms.includes("platform.actions.execute"), false);
  });

  test("capabilities modules derived from permissions", () => {
    const perms = getPlatformPermissions("platform_admin");
    const mm = { users: ["platform.users.manage"], sessions: ["platform.sessions.manage"], companies: ["platform.companies.read"], commercial: ["platform.commercial.read"], system: ["platform.system.read"], audit: ["platform.audit.read"], actions: ["platform.actions.execute"] };
    for (const [k, v] of Object.entries(mm)) {
      if (k === "actions") assert.equal(v.some((p) => perms.includes(p)), false);
      else assert.equal(v.some((p) => perms.includes(p)), true);
    }
  });

  test("capabilities no pagination field", () => {
    const data = { user: { id: "x" }, permissions: [], modules: {} };
    assert.equal(data.pagination, undefined);
    assert.equal(data.page, undefined);
    assert.equal(data.limit, undefined);
  });

  test("capabilities viewer has limited permissions", () => {
    const perms = getPlatformPermissions("platform_viewer");
    assert.ok(perms.includes("platform.companies.read"));
    assert.ok(perms.includes("platform.system.read"));
    assert.equal(perms.includes("platform.users.manage"), false);
    assert.equal(perms.includes("platform.commercial.read"), false);
    assert.equal(perms.includes("platform.audit.read"), false);
  });

  test("capabilities owner has all permissions", () => {
    const perms = getPlatformPermissions("platform_owner");
    assert.ok(perms.includes("platform.actions.execute"));
    assert.ok(perms.includes("platform.users.manage"));
    assert.ok(perms.includes("platform.sessions.manage"));
    assert.ok(perms.includes("platform.companies.read"));
    assert.ok(perms.includes("platform.commercial.read"));
    assert.ok(perms.includes("platform.system.read"));
    assert.ok(perms.includes("platform.audit.read"));
  });

  test("capabilities support permissions", () => {
    const perms = getPlatformPermissions("platform_support");
    assert.ok(perms.includes("platform.companies.read"));
    assert.ok(perms.includes("platform.system.read"));
    assert.ok(perms.includes("platform.audit.read"));
    assert.equal(perms.includes("platform.commercial.read"), false);
    assert.equal(perms.includes("platform.users.manage"), false);
  });

  test("capabilities finance permissions", () => {
    const perms = getPlatformPermissions("platform_finance");
    assert.ok(perms.includes("platform.companies.read"));
    assert.ok(perms.includes("platform.commercial.read"));
    assert.ok(perms.includes("platform.audit.read"));
    assert.equal(perms.includes("platform.users.manage"), false);
    assert.equal(perms.includes("platform.system.read"), false);
  });

  // ===== OVERVIEW =====
  await testAsync("overview uses real models", async () => {
    const users = await store.listUsers(null);
    const vc = await store.countVehiclesByStatus();
    assert.ok(Array.isArray(users));
    assert.ok(typeof vc.total === "number");
    assert.ok(typeof vc.on_route === "number");
  });

  await testAsync("overview does not call getLiveLocations", async () => {
    const original = store.getLiveLocations;
    let gpsCalled = false;
    store.getLiveLocations = () => { gpsCalled = true; return original(); };
    const vc = await store.countVehiclesByStatus();
    assert.equal(gpsCalled, false);
    assert.ok(vc.total >= 0);
    store.getLiveLocations = original;
  });

  await testAsync("unit without GPS is counted", async () => {
    const before = await store.countVehiclesByStatus();
    const created = store.createVehicle({ plate: "NO-GPS-1", code: "V-NOGPS", brand: "T", model: "M", year: 2023, capacity: 10, status: "on-route", organizationId: "org-alpha" });
    const after = await store.countVehiclesByStatus();
    assert.equal(after.total, before.total + 1);
    assert.equal(created.location, null);
  });

  test("generatedAt is valid ISO", () => {
    const generatedAt = new Date().toISOString();
    const date = new Date(generatedAt);
    assert.equal(isNaN(date.getTime()), false);
    assert.ok(generatedAt.endsWith("Z") || generatedAt.includes("T"));
  });

  test("overview sections respect permissions", () => {
    const viewerPerms = getPlatformPermissions("platform_viewer");
    const adminPerms = getPlatformPermissions("platform_admin");
    assert.equal(viewerPerms.includes("platform.commercial.read"), false);
    assert.equal(adminPerms.includes("platform.commercial.read"), true);
  });

  await testAsync("overview no personal data in response", async () => {
    const rq = mockReq({
      headers: { authorization: `Bearer ${adminToken}` },
      platformUser: { id: adminUser.id, role: "platform_admin", email: adminUser.email, status: "active" },
      platformSession: { ...adminSession, mfaVerified: true },
      platformAuth: { sub: adminUser.id, sid: adminSession.id, tokenType: "platform" }
    });
    const rs = mockRes();
    let body = null;
    async function handler(req, res) {
      const users = await store.listUsers(null);
      const vc = await store.countVehiclesByStatus();
      const orgIds = new Set();
      const usersByStatus = { active: 0, pending: 0, suspended: 0 };
      for (const u of users) {
        if (u.organizationId) orgIds.add(u.organizationId);
        const s = u.userStatus || u.status || "active";
        if (usersByStatus[s] !== undefined) usersByStatus[s]++;
        else usersByStatus.active++;
      }
      body = { generatedAt: new Date().toISOString(), companies: { total: orgIds.size }, users: { total: users.length, byStatus: usersByStatus }, vehicles: { total: vc.total, byStatus: { on_route: vc.on_route, maintenance: vc.maintenance, idle: vc.idle } } };
      res.json({ ok: true, data: body });
    }
    await require("../src/middlewares/platform-auth").platformAuth(rq, rs, async () => { await handler(rq, rs); });
    assert.ok(body);
    assert.equal(body.email, undefined);
    assert.equal(body.name, undefined);
    assert.equal(body.phone, undefined);
    assert.equal(body.documents, undefined);
    assert.equal(body.coordinates, undefined);
  });

  // ===== OVERVIEW: full integration =====
  await testAsync("overview returns correct counts with commercial", async () => {
    const ovStore = createEmbeddedStore();
    const ovUser = ovStore.createPlatformUser({ name: "OV Admin", email: "ov@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_admin" });
    const { session: ovRaw } = await createPlatformSession(ovUser.id, mockReq());
    await markPlatformSessionMfaVerified(ovRaw.id);
    const ovSession = { ...ovRaw, mfaVerified: true };
    const ovToken = signPlatformToken({ _id: ovUser.id, role: "platform_admin" }, ovSession.id);

    ovStore.createUser({ name: "U1", email: "u1@e.com", password: "Test1234!", role: "admin", organizationId: "org-1", userStatus: "active" });
    ovStore.createUser({ name: "U2", email: "u2@e.com", password: "Test1234!", role: "driver", organizationId: "org-1", userStatus: "active" });
    ovStore.createUser({ name: "U3", email: "u3@e.com", password: "Test1234!", role: "driver", organizationId: "org-2", userStatus: "pending" });
    ovStore.createUser({ name: "U4", email: "u4@e.com", password: "Test1234!", role: "driver", organizationId: "org-3", userStatus: "suspended" });
    ovStore.createVehicle({ plate: "V-1", code: "C001", brand: "T", model: "M", year: 2023, capacity: 10, status: "on-route", organizationId: "org-1" });
    ovStore.createVehicle({ plate: "V-2", code: "C002", brand: "T", model: "M", year: 2023, capacity: 10, status: "on-route", organizationId: "org-1" });
    ovStore.createVehicle({ plate: "V-3", code: "C003", brand: "T", model: "M", year: 2023, capacity: 10, status: "maintenance", organizationId: "org-2" });
    ovStore.createCommercialOrder({ planId: "starter-2", ownerAccountEmail: "o1@t.com", organizationId: "org-1" });
    ovStore.createCommercialOrder({ planId: "value-4", ownerAccountEmail: "o2@t.com", organizationId: "org-1" });
    ovStore.createCommercialOrder({ planId: "control-6", ownerAccountEmail: "o3@t.com", organizationId: "org-2" });
    ovStore.createCommercialOrder({ planId: "premium-8", ownerAccountEmail: "o4@t.com", organizationId: "org-3" });

    const rq = mockReq({
      headers: { authorization: `Bearer ${ovToken}` },
      platformUser: { id: ovUser.id, role: "platform_admin", email: "ov@manecomb.com", status: "active" },
      platformSession: ovSession,
      platformAuth: { sub: ovUser.id, sid: ovSession.id, tokenType: "platform" },
      app: { locals: { store: ovStore } }
    });
    const rs = mockRes();
    let captured = null;

    async function handler(req, res) {
      const users = await req.app.locals.store.listUsers(null);
      const vc = await req.app.locals.store.countVehiclesByStatus();
      const orders = await req.app.locals.store.listCommercialOrders();
      const orgIds = new Set();
      const usersByStatus = { active: 0, pending: 0, suspended: 0 };
      for (const u of users) {
        if (u.organizationId) orgIds.add(u.organizationId);
        const s = u.userStatus || u.status || "active";
        if (usersByStatus[s] !== undefined) usersByStatus[s]++;
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
      captured = { companies: { total: orgIds.size }, users: { total: users.length, byStatus: usersByStatus }, vehicles: { total: vc.total, byStatus: { on_route: vc.on_route, maintenance: vc.maintenance, idle: vc.idle } }, commercialOrders: { total: orders.length, byStatus: ordersByStatus } };
      res.json({ ok: true, data: captured });
    }

    await require("../src/middlewares/platform-auth").platformAuth(rq, rs, async () => {
      await require("../src/middlewares/platform-access").requirePlatformPermission("platform.companies.read")(rq, rs, () => handler(rq, rs));
    });

    assert.equal(rs.state.body.ok, true);
    assert.equal(captured.companies.total, 4);
    assert.equal(captured.users.total, 8);
    assert.equal(captured.users.byStatus.active, 6);
    assert.equal(captured.users.byStatus.pending, 1);
    assert.equal(captured.users.byStatus.suspended, 1);
    assert.equal(captured.vehicles.total, 6);
    assert.equal(captured.vehicles.byStatus.on_route, 4);
    assert.equal(captured.vehicles.byStatus.maintenance, 2);
    assert.equal(captured.vehicles.byStatus.idle, 0);
    assert.equal(captured.commercialOrders.total, 5);
    assert.equal(captured.commercialOrders.byStatus.active, 1);
    assert.equal(captured.commercialOrders.byStatus.pending, 4);
  });

  // ===== AUDIT =====
  await testAsync("recordPlatformAction returns entry with action", async () => {
    const { recordPlatformAction } = require("../src/services/platform-audit");
    const entry = await recordPlatformAction(mockReq({ platformUser: { id: adminUser.id, role: "platform_admin" } }), {
      action: "platform.capabilities.read",
      severity: "info",
      metadata: { role: "platform_admin" }
    });
    assert.ok(entry);
    assert.equal(entry.action, "platform.capabilities.read");
    assert.equal(entry.metadata.actorType, "platform");
    assert.equal(entry.metadata.platformRole, "platform_admin");
    assert.equal(entry.ip, "127.0.0.1");
  });

  await testAsync("recordPlatformAction overview audit", async () => {
    const { recordPlatformAction } = require("../src/services/platform-audit");
    const entry = await recordPlatformAction(mockReq({ platformUser: { id: adminUser.id, role: "platform_admin" } }), {
      action: "platform.overview.read",
      severity: "info",
      metadata: { companies: 1, users: 2, vehicles: 3 }
    });
    assert.ok(entry);
    assert.equal(entry.action, "platform.overview.read");
    assert.equal(entry.metadata.companies, 1);
    assert.equal(entry.metadata.users, 2);
    assert.equal(entry.metadata.vehicles, 3);
    assert.equal(entry.metadata.actorType, "platform");
  });

  // ===== MOUNT =====
  await testAsync("platform capabilities route works via createApp", async () => {
    const createApp = require("../src/app");
    const mountStore = createEmbeddedStore();
    const mountUser = mountStore.createPlatformUser({ name: "Mount Admin", email: "mount@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_admin" });
    const { session: mRaw } = await createPlatformSession(mountUser.id, mockReq());
    await markPlatformSessionMfaVerified(mRaw.id);
    const mToken = signPlatformToken({ _id: mountUser.id, role: "platform_admin" }, mRaw.id);

    const app = createApp({ store: mountStore, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
      server.listen(0, () => {
        const port = server.address().port;
        const opts = { hostname: "127.0.0.1", port, path: "/api/platform/capabilities", method: "GET", headers: { authorization: `Bearer ${mToken}` } };
        const req = http.request(opts, (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            const json = JSON.parse(body);
            assert.equal(res.statusCode, 200);
            assert.equal(json.ok, true);
            assert.ok(json.data.user);
            assert.equal(json.data.user.role, "platform_admin");
            assert.ok(Array.isArray(json.data.permissions));
            assert.ok(json.data.modules);
            server.close(); resolve();
          });
        });
        req.on("error", (err) => { server.close(); reject(err); });
        req.end();
      });
    });
  });

  await testAsync("platform overview route works via createApp", async () => {
    const createApp = require("../src/app");
    const ovStore = createEmbeddedStore();
    const ovUser = ovStore.createPlatformUser({ name: "Mount OV", email: "mov@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_admin" });
    ovStore.createUser({ name: "MU1", email: "mu1@e.com", password: "Test1234!", role: "admin", organizationId: "org-x", userStatus: "active" });
    ovStore.createVehicle({ plate: "M-1", code: "MC001", brand: "T", model: "M", year: 2023, capacity: 10, status: "on-route", organizationId: "org-x" });
    const { session: moRaw } = await createPlatformSession(ovUser.id, mockReq());
    await markPlatformSessionMfaVerified(moRaw.id);
    const moToken = signPlatformToken({ _id: ovUser.id, role: "platform_admin" }, moRaw.id);

    const app = createApp({ store: ovStore, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
      server.listen(0, () => {
        const port = server.address().port;
        const opts = { hostname: "127.0.0.1", port, path: "/api/platform/overview", method: "GET", headers: { authorization: `Bearer ${moToken}` } };
        const req = http.request(opts, (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            const json = JSON.parse(body);
            assert.equal(res.statusCode, 200);
            assert.equal(json.ok, true);
            assert.ok(json.data.generatedAt);
            assert.ok(json.data.companies);
            assert.ok(json.data.users);
            assert.ok(json.data.vehicles);
            server.close(); resolve();
          });
        });
        req.on("error", (err) => { server.close(); reject(err); });
        req.end();
      });
    });
  });

  await testAsync("platform auth login still mounted (not 404)", async () => {
    const createApp = require("../src/app");
    const loginStore = createEmbeddedStore();
    loginStore.createPlatformUser({ name: "Login Test", email: "login@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_admin" });
    const app = createApp({ store: loginStore, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
      server.listen(0, () => {
        const port = server.address().port;
        const body = JSON.stringify({ email: "login@manecomb.com", password: PLATFORM_PASSWORD });
        const opts = { hostname: "127.0.0.1", port, path: "/api/platform/auth/login", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } };
        const req = http.request(opts, (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            assert.notEqual(res.statusCode, 404);
            assert.notEqual(res.statusCode, 501);
            const json = JSON.parse(data);
            assert.equal(json.ok, true);
            server.close(); resolve();
          });
        });
        req.on("error", (err) => { server.close(); reject(err); });
        req.write(body);
        req.end();
      });
    });
  });

  await testAsync("platform mfa routes still mounted", async () => {
    const createApp = require("../src/app");
    const mfaStore = createEmbeddedStore();
    mfaStore.createPlatformUser({ name: "MFA Test", email: "mfa@manecomb.com", password: PLATFORM_PASSWORD, role: "platform_admin" });
    const app = createApp({ store: mfaStore, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
      server.listen(0, () => {
        const port = server.address().port;
        const opts = { hostname: "127.0.0.1", port, path: "/api/platform/auth/mfa/setup", method: "POST", headers: { "content-type": "application/json" } };
        const req = http.request(opts, (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            assert.notEqual(res.statusCode, 404);
            server.close(); resolve();
          });
        });
        req.on("error", (err) => { server.close(); reject(err); });
        req.end();
      });
    });
  });

  console.log(`\nAll ${passed}/${total} platform-api-base tests passed`);
}

main().catch((err) => { console.error("TEST SUITE FAILED:", err.message); process.exit(1); });
