process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { createEmbeddedStore } = require("../src/data/store");
const { sanitizePlatformUser } = require("../src/middlewares/platform-auth");
const { requirePlatformRole, requirePlatformPermission } = require("../src/middlewares/platform-access");
const { signPlatformToken, verifyPlatformToken } = require("../src/utils/platform-jwt");
const { createPlatformSession, getPlatformSessionById, revokePlatformSession, hashRefreshToken } = require("../src/services/platform-sessions");
const { recordPlatformAction } = require("../src/services/platform-audit");
const { hasPlatformPermission, PLATFORM_ROLES, PLATFORM_PERMISSIONS } = require("../src/config/platform-roles");

const TEST_PASSWORD = "Test@1234!secure";
let store, req;

function mockReq(overrides) {
  return {
    headers: { "user-agent": "test-agent", ...(overrides?.headers || {}) },
    ip: "127.0.0.1",
    app: { locals: { store } },
    platformUser: overrides?.platformUser || null,
    platformSession: overrides?.platformSession || null,
    platformAuth: overrides?.platformAuth || null
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

  // Setup
  store = createEmbeddedStore();
  store.createPlatformUser({ name: "Auth Test", email: "auth-test@manecomb.com", password: TEST_PASSWORD, role: "platform_admin" });
  store.createPlatformUser({ name: "Owner User", email: "owner@manecomb.com", password: TEST_PASSWORD, role: "platform_owner" });
  store.createPlatformUser({ name: "Suspended User", email: "suspended@manecomb.com", password: TEST_PASSWORD, role: "platform_viewer", status: "suspended" });
  store.createPlatformUser({ name: "Disabled User", email: "disabled@manecomb.com", password: TEST_PASSWORD, role: "platform_viewer", status: "disabled" });
  const lockedUser = store.createPlatformUser({ name: "Locked User", email: "locked@manecomb.com", password: TEST_PASSWORD, role: "platform_viewer" });
  store.updatePlatformUser(lockedUser.id, { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 3600000) });
  req = mockReq();

  // 1
  test("modelo platform user", () => {
    const u = store.getPlatformUserByEmail("auth-test@manecomb.com");
    assert.ok(u); assert.equal(u.role, "platform_admin"); assert.equal(u.email, "auth-test@manecomb.com");
    assert.ok(u.passwordHash); assert.ok(u._id); assert.equal(u.status, "active");
  });

  // 2
  await testAsync("modelo platform session", async () => {
    const { session } = await createPlatformSession("user-1", req);
    assert.ok(session.id); assert.ok(session.expiresAt); assert.ok(session.isActive); assert.equal(session.userId, "user-1");
  });

  // 3
  test("email único", () => {
    assert.throws(() => store.createPlatformUser({ name: "Dup", email: "auth-test@manecomb.com", password: TEST_PASSWORD, role: "platform_admin" }), /El correo ya existe/);
  });

  // 4
  test("roles válidos", () => {
    for (const role of PLATFORM_ROLES) {
      const u = store.createPlatformUser({ name: `Role ${role}`, email: `role-${role}@test.com`, password: TEST_PASSWORD, role });
      assert.equal(u.role, role);
    }
  });

  // 5 — login correcto
  let loginResult, refreshTokenValue, sessionIdValue;
  await testAsync("login correcto", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    loginResult = await login("auth-test@manecomb.com", TEST_PASSWORD, req);
    assert.ok(loginResult.token); assert.ok(loginResult.refreshToken); assert.ok(loginResult.user);
    assert.equal(loginResult.user.email, "auth-test@manecomb.com"); assert.equal(loginResult.user.role, "platform_admin");
    refreshTokenValue = loginResult.refreshToken; sessionIdValue = loginResult.session.id;
  });

  // 6
  await testAsync("login incorrecto — mensaje genérico", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("auth-test@manecomb.com", "WrongPassword123!", req);
    assert.equal(r.error, "Credenciales inválidas"); assert.equal(r.status, 401); assert.equal(r.token, undefined);
  });

  // 7
  await testAsync("correo inexistente — mensaje genérico", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("no-exist@manecomb.com", "SomePassword123!", req);
    assert.equal(r.error, "Credenciales inválidas"); assert.equal(r.status, 401);
  });

  // 8
  await testAsync("usuario suspendido", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("suspended@manecomb.com", TEST_PASSWORD, req);
    assert.equal(r.error, "Credenciales inválidas"); assert.equal(r.status, 401);
  });

  // 9
  await testAsync("usuario deshabilitado", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("disabled@manecomb.com", TEST_PASSWORD, req);
    assert.equal(r.error, "Credenciales inválidas"); assert.equal(r.status, 401);
  });

  // 10
  await testAsync("bloqueo temporal", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("locked@manecomb.com", TEST_PASSWORD, req);
    assert.equal(r.error, "Credenciales inválidas"); assert.equal(r.status, 401);
  });

  // 11
  test("JWT tokenType platform", () => {
    const d = verifyPlatformToken(loginResult.token);
    assert.equal(d.tokenType, "platform");
  });

  // 12
  test("JWT aud e iss", () => {
    const d = verifyPlatformToken(loginResult.token);
    assert.equal(d.aud, "manecomb-platform-admin"); assert.equal(d.iss, "manecomb-api");
  });

  // 13
  test("JWT sin organizationId", () => {
    const d = verifyPlatformToken(loginResult.token);
    assert.equal(d.organizationId, undefined); assert.equal(d.orgId, undefined);
  });

  // 14
  test("JWT sub y sid", () => {
    const d = verifyPlatformToken(loginResult.token);
    assert.ok(d.sub); assert.ok(d.sid); assert.equal(d.sid, sessionIdValue); assert.equal(d.role, "platform_admin");
  });

  // 15
  await testAsync("token enterprise rechazado por platformAuth", async () => {
    const enterpriseToken = jwt.sign({ tokenType: "enterprise" }, process.env.JWT_SECRET || "test-secret", { expiresIn: "15m" });
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const entReq = mockReq({ headers: { authorization: `Bearer ${enterpriseToken}` } });
    const entRes = mockRes();
    let called = false;
    await platformAuth(entReq, entRes, () => { called = true; });
    assert.equal(called, false); assert.equal(entRes.state.statusCode, 401);
  });

  // 16 + 17: refresh rotativo y refresh anterior rechazado
  const previousRefreshToken = refreshTokenValue;
  await testAsync("refresh rotativo", async () => {
    const { refresh } = require("../src/modules/platform/platform-auth-service");
    const first = await refresh(previousRefreshToken, req);
    assert.ok(first.token); assert.ok(first.refreshToken); assert.notEqual(first.refreshToken, previousRefreshToken);
    refreshTokenValue = first.refreshToken;
  });

  await testAsync("refresh anterior rechazado", async () => {
    const { refresh } = require("../src/modules/platform/platform-auth-service");
    const second = await refresh(previousRefreshToken, req);
    assert.equal(second.error, "Refresh token inválido o expirado"); assert.equal(second.status, 401);
  });

  // 18 — sesión expirada
  await testAsync("sesión expirada", async () => {
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const expSession = await createPlatformSession("user-expired", { ...req, headers: { "user-agent": "exp" } });
    const s = await getPlatformSessionById(expSession.session.id);
    s.expiresAt = new Date(Date.now() - 1000);
    const token = signPlatformToken({ _id: "user-expired", role: "platform_viewer" }, expSession.session.id);
    const expReq = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const expRes = mockRes();
    let c = false;
    await platformAuth(expReq, expRes, () => { c = true; });
    assert.equal(c, false); assert.equal(expRes.state.statusCode, 401);
  });

  // 19 — sesión revocada
  await testAsync("sesión revocada", async () => {
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const { session } = await createPlatformSession("user-revoke", req);
    await revokePlatformSession("user-revoke", session.id, "test");
    const token = signPlatformToken({ _id: "user-revoke", role: "platform_viewer" }, session.id);
    const revReq = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const revRes = mockRes();
    let c = false;
    await platformAuth(revReq, revRes, () => { c = true; });
    assert.equal(c, false); assert.equal(revRes.state.statusCode, 401);
  });

  // 20 — logout
  await testAsync("logout", async () => {
    const { logout } = require("../src/modules/platform/platform-auth-service");
    const logReq = mockReq({ platformUser: { id: loginResult.user.id, role: "platform_admin" }, platformSession: { _id: sessionIdValue } });
    const r = await logout(logReq);
    assert.equal(r.message, "Sesión cerrada");
    const s = await getPlatformSessionById(sessionIdValue);
    assert.ok(s.revokedAt); assert.equal(s.isActive, false);
  });

  // 21 — logout-all
  await testAsync("logout-all", async () => {
    const { login, logoutAll } = require("../src/modules/platform/platform-auth-service");
    const fresh = await login("owner@manecomb.com", TEST_PASSWORD, req);
    const logReq = mockReq({ platformUser: { id: fresh.user.id, role: "platform_owner" }, platformSession: { _id: fresh.session.id } });
    const r = await logoutAll(logReq);
    assert.equal(r.message, "Todas las sesiones cerradas"); assert.ok(typeof r.revokedCount === "number");
  });

  // 22
  test("permisos por rol", () => {
    const o = PLATFORM_PERMISSIONS.platform_owner;
    assert.ok(o.includes("platform.users.manage")); assert.ok(o.includes("platform.sessions.manage"));
    assert.ok(o.includes("platform.companies.read")); assert.ok(o.includes("platform.commercial.read"));
    assert.ok(o.includes("platform.system.read")); assert.ok(o.includes("platform.audit.read"));
    assert.ok(o.includes("platform.actions.execute"));
    const v = PLATFORM_PERMISSIONS.platform_viewer;
    assert.ok(v.includes("platform.companies.read")); assert.ok(v.includes("platform.system.read"));
    assert.ok(!v.includes("platform.users.manage")); assert.ok(!v.includes("platform.actions.execute"));
    assert.ok(hasPlatformPermission("platform_owner", "platform.users.manage"));
    assert.ok(!hasPlatformPermission("platform_viewer", "platform.users.manage"));
  });

  // 23
  test("requirePlatformRole", () => {
    const f1 = mockReq({ platformUser: { role: "platform_viewer" } }); const r1 = mockRes();
    requirePlatformRole("platform_owner", "platform_admin")(f1, r1, () => {});
    assert.equal(r1.state.statusCode, 403);
    const f2 = mockReq({ platformUser: { role: "platform_admin" } }); const r2 = mockRes();
    let ok = false;
    requirePlatformRole("platform_owner", "platform_admin")(f2, r2, () => { ok = true; });
    assert.equal(ok, true);
  });

  // 24
  test("requirePlatformPermission", () => {
    const f1 = mockReq({ platformUser: { role: "platform_viewer" } }); const r1 = mockRes();
    requirePlatformPermission("platform.users.manage")(f1, r1, () => {});
    assert.equal(r1.state.statusCode, 403);
    const f2 = mockReq({ platformUser: { role: "platform_owner" } }); const r2 = mockRes();
    let ok = false;
    requirePlatformPermission("platform.users.manage")(f2, r2, () => { ok = true; });
    assert.equal(ok, true);
  });

  // 25
  test("serializer sin secretos", () => {
    const u = store.getPlatformUserByEmail("auth-test@manecomb.com");
    const s = sanitizePlatformUser(u);
    assert.equal(s.passwordHash, undefined); assert.equal(s.failedLoginAttempts, undefined);
    assert.equal(s.lockedUntil, undefined); assert.equal(s.suspendedReason, undefined);
    assert.ok(s.id); assert.ok(s.name); assert.ok(s.email); assert.ok(s.role); assert.ok(s.status);
  });

  // 26
  test("no creación de UserModel enterprise", () => {
    const e = store.getUserById ? store.getUserById(loginResult.user.id) : null;
    assert.equal(e, null);
  });

  // 27
  await testAsync("auditoría sin secretos", async () => {
    const entry = await recordPlatformAction(req, { action: "platform.auth.test", actorId: loginResult.user.id, platformRole: "platform_admin", metadata: { result: "success" } });
    assert.ok(entry._id); assert.equal(entry.action, "platform.auth.test");
    assert.equal(entry.metadata.actorType, "platform"); assert.equal(entry.metadata.platformRole, "platform_admin");
    const str = JSON.stringify(entry);
    assert.equal(str.includes("password"), false); assert.equal(str.includes(TEST_PASSWORD), false);
  });

  // 28
  await testAsync("login owner", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("owner@manecomb.com", TEST_PASSWORD, req);
    assert.ok(r.token); assert.equal(r.user.role, "platform_owner");
  });

  // 29
  await testAsync("correo normalizado", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("AUTH-TEST@manecomb.com", TEST_PASSWORD, req);
    assert.ok(r.token);
  });

  // 30
  test("refresh token almacenado como hash", () => {
    const hashed = hashRefreshToken("test-refresh-value");
    assert.ok(hashed); assert.notEqual(hashed, "test-refresh-value"); assert.equal(hashed.length, 64);
  });

  console.log(`\nAll ${passed}/${total} platform-auth tests passed`);
}

main().catch((err) => { console.error("TEST SUITE FAILED:", err.message); process.exit(1); });
