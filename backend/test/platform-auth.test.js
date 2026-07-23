process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createEmbeddedStore } = require("../src/data/store");
const { sanitizePlatformUser } = require("../src/middlewares/platform-auth");
const { requirePlatformRole, requirePlatformPermission } = require("../src/middlewares/platform-access");
const { signPlatformToken, verifyPlatformToken } = require("../src/utils/platform-jwt");
const { createPlatformSession, getPlatformSessionById, revokePlatformSession } = require("../src/services/platform-sessions");
const { recordPlatformAction } = require("../src/services/platform-audit");
const { hasPlatformPermission, PLATFORM_ROLES, PLATFORM_PERMISSIONS } = require("../src/config/platform-roles");

const TEST_PASSWORD = "Test@1234!secure";
let store, req;

function mockReq(overrides = {}) {
  const base = {
    headers: { "user-agent": "test-agent", ...overrides.headers },
    ip: "127.0.0.1",
    app: { locals: { store } },
    platformUser: overrides.platformUser || null,
    platformSession: overrides.platformSession || null,
    platformAuth: overrides.platformAuth || null
  };
  return { ...base, ...overrides };
}

function mockRes() {
  const state = { statusCode: 200, body: null, called: false };
  return {
    state,
    status(code) { state.statusCode = code; return this; },
    json(body) { state.body = body; return this; }
  };
}

async function setup() {
  store = createEmbeddedStore();

  store.createPlatformUser({
    name: "Auth Test", email: "auth-test@manecomb.com", password: TEST_PASSWORD, role: "platform_admin"
  });
  store.createPlatformUser({
    name: "Owner User", email: "owner@manecomb.com", password: TEST_PASSWORD, role: "platform_owner"
  });
  store.createPlatformUser({
    name: "Suspended User", email: "suspended@manecomb.com", password: TEST_PASSWORD, role: "platform_viewer", status: "suspended"
  });
  store.createPlatformUser({
    name: "Disabled User", email: "disabled@manecomb.com", password: TEST_PASSWORD, role: "platform_viewer", status: "disabled"
  });

  // Locked user
  const lockedUser = store.createPlatformUser({
    name: "Locked User", email: "locked@manecomb.com", password: TEST_PASSWORD, role: "platform_viewer"
  });
  store.updatePlatformUser(lockedUser.id, {
    failedLoginAttempts: 5,
    lockedUntil: new Date(Date.now() + 3600000)
  });

  req = mockReq();
}

async function runTests() {
  let passed = 0;

  function test(name, fn) {
    try { fn(); passed++; console.log("PASS:", name); }
    catch (err) { console.error("FAIL:", name, "-", err.message); process.exit(1); }
  }

  async function testAsync(name, fn) {
    try { await fn(); passed++; console.log("PASS:", name); }
    catch (err) { console.error("FAIL:", name, "-", err.message); process.exit(1); }
  }

  // 1. modelo platform user
  test("modelo platform user", () => {
    const user = store.getPlatformUserByEmail("auth-test@manecomb.com");
    assert.ok(user);
    assert.equal(user.role, "platform_admin");
    assert.equal(user.email, "auth-test@manecomb.com");
    assert.ok(user.passwordHash);
    assert.ok(user._id);
    assert.equal(user.status, "active");
    assert.equal(user.failedLoginAttempts, 0);
    assert.equal(user.name, "Auth Test");
  });

  // 2. modelo platform session
  testAsync("modelo platform session", async () => {
    const { session } = await createPlatformSession("user-1", req);
    assert.ok(session.id);
    assert.ok(session.expiresAt);
    assert.ok(session.isActive);
    assert.equal(session.userId, "user-1");
  });

  // 3. email único
  test("email único", () => {
    assert.throws(() => {
      store.createPlatformUser({
        name: "Duplicate", email: "auth-test@manecomb.com", password: TEST_PASSWORD, role: "platform_admin"
      });
    }, /El correo ya existe/);
  });

  // 4. roles válidos
  test("roles válidos", () => {
    for (const role of PLATFORM_ROLES) {
      const u = store.createPlatformUser({
        name: `Role ${role}`, email: `role-${role}@manecomb.com`, password: TEST_PASSWORD, role
      });
      assert.equal(u.role, role);
    }
  });

  // 5. login correcto
  let loginResult, refreshTokenValue, sessionIdValue;
  testAsync("login correcto", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    loginResult = await login("auth-test@manecomb.com", TEST_PASSWORD, req);
    assert.ok(loginResult.token);
    assert.ok(loginResult.refreshToken);
    assert.ok(loginResult.user);
    assert.equal(loginResult.user.email, "auth-test@manecomb.com");
    assert.equal(loginResult.user.role, "platform_admin");
    assert.ok(loginResult.user.id);
    refreshTokenValue = loginResult.refreshToken;
    sessionIdValue = loginResult.session.id;
  });

  // 6. login incorrecto — mensaje genérico
  testAsync("login incorrecto — mensaje genérico", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("auth-test@manecomb.com", "WrongPassword123!", req);
    assert.equal(r.error, "Credenciales inválidas");
    assert.equal(r.status, 401);
    assert.equal(r.token, undefined);
  });

  // 7. correo inexistente — mensaje genérico
  testAsync("correo inexistente — mensaje genérico", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("no-exist@manecomb.com", "SomePassword123!", req);
    assert.equal(r.error, "Credenciales inválidas");
    assert.equal(r.status, 401);
  });

  // 8. usuario suspendido
  testAsync("usuario suspendido", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("suspended@manecomb.com", TEST_PASSWORD, req);
    assert.equal(r.error, "Credenciales inválidas");
    assert.equal(r.status, 401);
  });

  // 9. usuario deshabilitado
  testAsync("usuario deshabilitado", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("disabled@manecomb.com", TEST_PASSWORD, req);
    assert.equal(r.error, "Credenciales inválidas");
    assert.equal(r.status, 401);
  });

  // 10. bloqueo temporal
  testAsync("bloqueo temporal", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("locked@manecomb.com", TEST_PASSWORD, req);
    assert.equal(r.error, "Credenciales inválidas");
    assert.equal(r.status, 401);
  });

  // 11. JWT tokenType platform
  test("JWT tokenType platform", () => {
    const decoded = verifyPlatformToken(loginResult.token);
    assert.equal(decoded.tokenType, "platform");
  });

  // 12. JWT aud e iss
  test("JWT aud e iss", () => {
    const decoded = verifyPlatformToken(loginResult.token);
    assert.equal(decoded.aud, "manecomb-platform-admin");
    assert.equal(decoded.iss, "manecomb-api");
  });

  // 13. JWT sin organizationId
  test("JWT sin organizationId", () => {
    const decoded = verifyPlatformToken(loginResult.token);
    assert.equal(decoded.organizationId, undefined);
    assert.equal(decoded.orgId, undefined);
  });

  // 14. JWT sub y sid
  test("JWT sub y sid", () => {
    const decoded = verifyPlatformToken(loginResult.token);
    assert.ok(decoded.sub);
    assert.ok(decoded.sid);
    assert.equal(decoded.sid, sessionIdValue);
    assert.equal(decoded.role, "platform_admin");
  });

  // 15. token enterprise rechazado por platformAuth
  testAsync("token enterprise rechazado por platformAuth", async () => {
    const enterpriseToken = jwt.sign(
      { tokenType: "enterprise", uid: "user-1" },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "15m" }
    );
    const { platformAuth } = require("../src/middlewares/platform-auth");
    const enterpriseReq = mockReq({ headers: { authorization: `Bearer ${enterpriseToken}` } });
    const enterpriseRes = mockRes();
    let called = false;
    await platformAuth(enterpriseReq, enterpriseRes, () => { called = true; });
    assert.equal(called, false);
    assert.equal(enterpriseRes.state.statusCode, 401);
  });

  // 16. refresh rotativo
  testAsync("refresh rotativo", async () => {
    const { refresh } = require("../src/modules/platform/platform-auth-service");
    const firstRefresh = await refresh(refreshTokenValue, req);
    assert.ok(firstRefresh.token);
    assert.ok(firstRefresh.refreshToken);
    assert.notEqual(firstRefresh.refreshToken, refreshTokenValue);
    refreshTokenValue = firstRefresh.refreshToken;
  });

  // 17. refresh anterior rechazado
  testAsync("refresh anterior rechazado", async () => {
    const { refresh } = require("../src/modules/platform/platform-auth-service");
    const secondRefresh = await refresh(refreshTokenValue, req);
    assert.equal(secondRefresh.error, "Refresh token inválido o expirado");
    assert.equal(secondRefresh.status, 401);
  });

  // 18. sesión expirada
  testAsync("sesión expirada", async () => {
    const expiredSession = await createPlatformSession("user-expired", {
      ...req, headers: { "user-agent": "expired-test" }
    });
    const session = await getPlatformSessionById(expiredSession.session.id);
    session.expiresAt = new Date(Date.now() - 1000);

    const { platformAuth } = require("../src/middlewares/platform-auth");
    const token = signPlatformToken({ _id: "user-expired", role: "platform_viewer" }, expiredSession.session.id);
    const expiredReq = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const expiredRes = mockRes();
    let expiredCalled = false;
    await platformAuth(expiredReq, expiredRes, () => { expiredCalled = true; });
    assert.equal(expiredCalled, false);
    assert.equal(expiredRes.state.statusCode, 401);
  });

  // 19. sesión revocada
  testAsync("sesión revocada", async () => {
    const { session } = await createPlatformSession("user-revoke", req);
    await revokePlatformSession("user-revoke", session.id, "test_revoke");

    const { platformAuth } = require("../src/middlewares/platform-auth");
    const token = signPlatformToken({ _id: "user-revoke", role: "platform_viewer" }, session.id);
    const revokedReq = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const revokedRes = mockRes();
    let revokedCalled = false;
    await platformAuth(revokedReq, revokedRes, () => { revokedCalled = true; });
    assert.equal(revokedCalled, false);
    assert.equal(revokedRes.state.statusCode, 401);
  });

  // 20. logout
  testAsync("logout", async () => {
    const { logout } = require("../src/modules/platform/platform-auth-service");
    const logoutReq = mockReq({
      platformUser: { id: loginResult.user.id, role: "platform_admin" },
      platformSession: { _id: sessionIdValue }
    });
    const logoutResult = await logout(logoutReq);
    assert.equal(logoutResult.message, "Sesión cerrada");

    const session = await getPlatformSessionById(sessionIdValue);
    assert.ok(session.revokedAt);
    assert.equal(session.isActive, false);
  });

  // 21. logout-all
  testAsync("logout-all", async () => {
    const { login, logoutAll } = require("../src/modules/platform/platform-auth-service");
    const fresh = await login("owner@manecomb.com", TEST_PASSWORD, req);
    const logoutReq = mockReq({
      platformUser: { id: fresh.user.id, role: "platform_owner" },
      platformSession: { _id: fresh.session.id }
    });
    const result = await logoutAll(logoutReq);
    assert.equal(result.message, "Todas las sesiones cerradas");
    assert.ok(typeof result.revokedCount === "number");
  });

  // 22. permisos por rol
  test("permisos por rol", () => {
    const ownerPerms = PLATFORM_PERMISSIONS.platform_owner;
    assert.ok(ownerPerms.includes("platform.users.manage"));
    assert.ok(ownerPerms.includes("platform.sessions.manage"));
    assert.ok(ownerPerms.includes("platform.companies.read"));
    assert.ok(ownerPerms.includes("platform.commercial.read"));
    assert.ok(ownerPerms.includes("platform.system.read"));
    assert.ok(ownerPerms.includes("platform.audit.read"));
    assert.ok(ownerPerms.includes("platform.actions.execute"));

    const viewerPerms = PLATFORM_PERMISSIONS.platform_viewer;
    assert.ok(viewerPerms.includes("platform.companies.read"));
    assert.ok(viewerPerms.includes("platform.system.read"));
    assert.ok(!viewerPerms.includes("platform.users.manage"));
    assert.ok(!viewerPerms.includes("platform.actions.execute"));

    assert.ok(hasPlatformPermission("platform_owner", "platform.users.manage"));
    assert.ok(!hasPlatformPermission("platform_viewer", "platform.users.manage"));
  });

  // 23. requirePlatformRole
  test("requirePlatformRole", () => {
    const failReq = mockReq({ platformUser: { role: "platform_viewer" } });
    const failRes = mockRes();
    requirePlatformRole("platform_owner", "platform_admin")(failReq, failRes, () => {});
    assert.equal(failRes.state.statusCode, 403);

    const passReq = mockReq({ platformUser: { role: "platform_admin" } });
    const passRes = mockRes();
    let passed = false;
    requirePlatformRole("platform_owner", "platform_admin")(passReq, passRes, () => { passed = true; });
    assert.equal(passed, true);
  });

  // 24. requirePlatformPermission
  test("requirePlatformPermission", () => {
    const failReq = mockReq({ platformUser: { role: "platform_viewer" } });
    const failRes = mockRes();
    requirePlatformPermission("platform.users.manage")(failReq, failRes, () => {});
    assert.equal(failRes.state.statusCode, 403);

    const passReq = mockReq({ platformUser: { role: "platform_owner" } });
    const passRes = mockRes();
    let passed = false;
    requirePlatformPermission("platform.users.manage")(passReq, passRes, () => { passed = true; });
    assert.equal(passed, true);
  });

  // 25. serializer sin secretos
  test("serializer sin secretos", () => {
    const user = store.getPlatformUserByEmail("auth-test@manecomb.com");
    const sanitized = sanitizePlatformUser(user);
    assert.equal(sanitized.passwordHash, undefined);
    assert.equal(sanitized.failedLoginAttempts, undefined);
    assert.equal(sanitized.lockedUntil, undefined);
    assert.equal(sanitized.suspendedReason, undefined);
    assert.ok(sanitized.id);
    assert.ok(sanitized.name);
    assert.ok(sanitized.email);
    assert.ok(sanitized.role);
    assert.ok(sanitized.status);
  });

  // 26. no creación de UserModel enterprise
  test("no creación de UserModel enterprise", () => {
    const enterpriseUser = store.getUserById ? store.getUserById(loginResult.user.id) : null;
    assert.equal(enterpriseUser, null);
  });

  // 27. auditoría sin secretos
  testAsync("auditoría sin secretos", async () => {
    const auditEntry = await recordPlatformAction(req, {
      action: "platform.auth.test",
      actorId: loginResult.user.id,
      platformRole: "platform_admin",
      metadata: { result: "success" }
    });
    assert.ok(auditEntry._id);
    assert.equal(auditEntry.action, "platform.auth.test");
    assert.equal(auditEntry.metadata.actorType, "platform");
    assert.equal(auditEntry.metadata.platformRole, "platform_admin");
    const str = JSON.stringify(auditEntry);
    assert.equal(str.includes("password"), false);
    assert.equal(str.includes(TEST_PASSWORD), false);
  });

  // 28. login owner
  testAsync("login owner", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const ownerResult = await login("owner@manecomb.com", TEST_PASSWORD, req);
    assert.ok(ownerResult.token);
    assert.equal(ownerResult.user.role, "platform_owner");
  });

  // 29. correo normalizado
  testAsync("correo normalizado", async () => {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const r = await login("AUTH-TEST@manecomb.com", TEST_PASSWORD, req);
    assert.ok(r.token);
  });

  // 30. refresh token no almacenado en texto plano
  test("refresh token almacenado como hash", () => {
    const raw = "test-refresh-token-value";
    const hashed = require("../src/services/platform-sessions").hashRefreshToken(raw);
    assert.ok(hashed);
    assert.notEqual(hashed, raw);
    assert.equal(hashed.length, 64); // SHA-256 hex
  });

  console.log(`\nAll ${passed} platform-auth tests passed`);
}

(async () => {
  try {
    await setup();
    await runTests();
  } catch (err) {
    console.error("TEST SUITE FAILED:", err.message);
    process.exit(1);
  }
})();
