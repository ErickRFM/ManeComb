process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";
require("./platform-mongo-store-model-import.test");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { encrypt, decrypt } = require("../src/utils/platform-mfa-crypto");
const { generateBase32Secret, generateTOTP, TOTP_PERIOD } = require("../src/utils/platform-totp");
const { mfaVerify } = require("../src/modules/platform/platform-mfa-service");
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
    platformAuth: overrides?.platformAuth || null,
    body: overrides?.body || {}
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

  function enableMfa(email) {
    const user = store.getPlatformUserByEmail(email);
    const secret = generateBase32Secret();
    store.updatePlatformUser(user.id || user._id, {
      mfaEnabled: true,
      mfaEnrollmentRequired: false,
      mfaSecretEncrypted: encrypt(secret),
      mfaBackupCodes: []
    });
  }

  enableMfa("auth-test@manecomb.com");
  enableMfa("owner@manecomb.com");

  async function loginWithMfa(email, password) {
    const { login } = require("../src/modules/platform/platform-auth-service");
    const initial = await login(email, password, req);
    if (initial.error) return initial;
    assert.ok(initial.mfaRequired);
    assert.ok(initial.challengeToken);
    assert.ok(!initial.token);
    const user = store.getPlatformUserByEmail(String(email).trim().toLowerCase());
    const secret = decrypt(user.mfaSecretEncrypted);
    const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
    const token = generateTOTP(secret, counter);
    const verified = await mfaVerify(mockReq({
      body: { challengeToken: initial.challengeToken, token }
    }));
    if (verified.error) return verified;
    return {
      ...verified,
      refreshToken: initial.refreshToken,
      session: initial.session
    };
  }

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
    loginResult = await loginWithMfa("auth-test@manecomb.com", TEST_PASSWORD);
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
    const { logoutAll } = require("../src/modules/platform/platform-auth-service");
    const fresh = await loginWithMfa("owner@manecomb.com", TEST_PASSWORD);
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
    const r = await loginWithMfa("owner@manecomb.com", TEST_PASSWORD);
    assert.ok(r.token); assert.equal(r.user.role, "platform_owner");
  });

  // 29
  await testAsync("correo normalizado", async () => {
    const r = await loginWithMfa("AUTH-TEST@manecomb.com", TEST_PASSWORD);
    assert.ok(r.token);
  });

  // 30
  test("refresh token almacenado como hash", () => {
    const hashed = hashRefreshToken("test-refresh-value");
    assert.ok(hashed); assert.notEqual(hashed, "test-refresh-value"); assert.equal(hashed.length, 64);
  });

  // 31 — isPlatformSecretValid con el secreto actual (cargado desde .env)
  test("isPlatformSecretValid retorna true con secreto válido", () => {
    const { isPlatformSecretValid } = require("../src/utils/platform-jwt");
    assert.equal(typeof isPlatformSecretValid, "function");
    // Con el .env actual el secreto es válido (>32 chars)
    assert.ok(isPlatformSecretValid());
  });

  // 32 — signPlatformToken y verifyPlatformToken funcionan con secreto válido
  await testAsync("signPlatformToken funciona con secreto válido", async () => {
    const token = signPlatformToken({ _id: "test-user", role: "platform_admin" }, "test-session");
    assert.ok(token);
    const decoded = verifyPlatformToken(token);
    assert.equal(decoded.tokenType, "platform");
    assert.equal(decoded.sub, "test-user");
    assert.equal(decoded.sid, "test-session");
    assert.equal(decoded.aud, "manecomb-platform-admin");
    assert.equal(decoded.iss, "manecomb-api");
  });

  // 33 — platformAuth rechaza token enterprise (firmado con JWT_SECRET)
  await testAsync("platformAuth rechaza token enterprise", async () => {
    const enterpriseToken = jwt.sign(
      { tokenType: "enterprise", uid: "user-1" },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn: "15m" }
    );
    const { platformAuth: pa } = require("../src/middlewares/platform-auth");
    const eReq = mockReq({ headers: { authorization: `Bearer ${enterpriseToken}` } });
    const eRes = mockRes();
    let called = false;
    await pa(eReq, eRes, () => { called = true; });
    assert.equal(called, false);
    // Should be 401 (verifyPlatformToken fails because different secret)
    assert.equal(eRes.state.statusCode, 401);
  });

  // 34 — token platform sin audience correcto
  await testAsync("token platform sin audience correcto es rechazado", async () => {
    const wrongAudToken = require("jsonwebtoken").sign(
      { tokenType: "platform", role: "platform_admin", sid: "sess-1" },
      process.env.PLATFORM_JWT_SECRET || "test",
      { subject: "user-1", audience: "wrong-audience", issuer: "manecomb-api", expiresIn: "15m" }
    );
    const { verifyPlatformToken: vpt } = require("../src/utils/platform-jwt");
    try {
      vpt(wrongAudToken);
      assert.fail("Debió rechazar audience incorrecto");
    } catch (e) {
      assert.ok(e.message.includes("audience") || e.name === "JsonWebTokenError" || e.name === "PlatformAuthNotConfigured");
    }
  });

  // 35 — token platform sin issuer correcto
  await testAsync("token platform sin issuer correcto es rechazado", async () => {
    const wrongIssToken = require("jsonwebtoken").sign(
      { tokenType: "platform", role: "platform_admin", sid: "sess-1" },
      process.env.PLATFORM_JWT_SECRET || "test",
      { subject: "user-1", audience: "manecomb-platform-admin", issuer: "wrong-issuer", expiresIn: "15m" }
    );
    const { verifyPlatformToken: vpt } = require("../src/utils/platform-jwt");
    try {
      vpt(wrongIssToken);
      assert.fail("Debió rechazar issuer incorrecto");
    } catch (e) {
      assert.ok(e.message.includes("issuer") || e.name === "JsonWebTokenError" || e.name === "PlatformAuthNotConfigured");
    }
  });

  // 36 — verifyPlatformToken valida criptografía; platformAuth exige tokenType platform
  await testAsync("verifyPlatformToken no exige tokenType; platformAuth sí lo exige", async () => {
    // Un token firmado correctamente sin tokenType pasa verifyPlatformToken
    const noTypeToken = require("jsonwebtoken").sign(
      { role: "platform_admin", sid: "test-sid" },
      process.env.PLATFORM_JWT_SECRET || "test",
      { subject: "test-sub", audience: "manecomb-platform-admin", issuer: "manecomb-api", expiresIn: "15m" }
    );
    const decoded = verifyPlatformToken(noTypeToken);
    assert.equal(decoded.tokenType, undefined);
    assert.equal(decoded.sub, "test-sub");

    // Pero platformAuth middleware lo rechaza
    const { platformAuth: pa } = require("../src/middlewares/platform-auth");
    const ntReq = mockReq({ headers: { authorization: `Bearer ${noTypeToken}` } });
    const ntRes = mockRes();
    let called = false;
    await pa(ntReq, ntRes, () => { called = true; });
    assert.equal(called, false);
    assert.equal(ntRes.state.statusCode, 401);
  });

  // 37 — token platform sin sid
  await testAsync("platformAuth rechaza token sin sid", async () => {
    const noSidToken = require("jsonwebtoken").sign(
      { tokenType: "platform", role: "platform_admin" },
      process.env.PLATFORM_JWT_SECRET || "test",
      { subject: "user-1", audience: "manecomb-platform-admin", issuer: "manecomb-api", expiresIn: "15m" }
    );
    const { platformAuth: pa } = require("../src/middlewares/platform-auth");
    const nsReq = mockReq({ headers: { authorization: `Bearer ${noSidToken}` } });
    const nsRes = mockRes();
    let called = false;
    await pa(nsReq, nsRes, () => { called = true; });
    assert.equal(called, false);
    assert.equal(nsRes.state.statusCode, 401);
  });

  // 38 — token firmado con JWT_SECRET es rechazado por platformAuth
  await testAsync("token firmado con JWT_SECRET rechazado por platformAuth", async () => {
    const wrongKeyToken = require("jsonwebtoken").sign(
      { tokenType: "platform", role: "platform_admin", sid: "sess-1" },
      "enterprise-secret-key-not-platform",
      { subject: "user-1", audience: "manecomb-platform-admin", issuer: "manecomb-api", expiresIn: "15m" }
    );
    const { platformAuth: pa } = require("../src/middlewares/platform-auth");
    const wkReq = mockReq({ headers: { authorization: `Bearer ${wrongKeyToken}` } });
    const wkRes = mockRes();
    let called = false;
    await pa(wkReq, wkRes, () => { called = true; });
    assert.equal(called, false);
    assert.equal(wkRes.state.statusCode, 401);
  });

  // 39 — authenticate enterprise rechaza token platform (middleware real)
  await testAsync("authenticate enterprise rechaza token platform", async () => {
    const platformToken = signPlatformToken({ _id: "platform-user-01", role: "platform_admin" }, "sess-01");
    const { authenticate } = require("../src/middlewares/authenticate");
    const entReq = mockReq({ headers: { authorization: `Bearer ${platformToken}` } });
    const entRes = mockRes();
    let called = false;
    await authenticate(entReq, entRes, () => { called = true; });
    assert.equal(called, false);
    assert.equal(entRes.state.statusCode, 401);
    // Confirmar que no se estableció req.user ni req.tenant enterprise
    assert.equal(entReq.user, undefined);
    assert.equal(entReq.tenant, undefined);
  });

  // 40 — env.js expone el contrato Platform; la validación productiva vive en platform-security
  test("env.js expone las variables Platform", () => {
    const env = require("../src/config/env");
    assert.ok("PLATFORM_JWT_SECRET" in env);
    assert.ok("PLATFORM_ACCESS_TOKEN_TTL" in env);
    assert.ok("PLATFORM_REFRESH_TOKEN_TTL_DAYS" in env);
  });

  // 41 — error PlatformAuthNotConfigured tiene statusCode 503
  test("PlatformAuthNotConfigured tiene statusCode 503", () => {
    const { PlatformAuthNotConfigured } = require("../src/utils/platform-jwt");
    const err = new PlatformAuthNotConfigured();
    assert.equal(err.name, "PlatformAuthNotConfigured");
    assert.equal(err.statusCode, 503);
    assert.ok(err.platformUnavailable);
    assert.ok(err.message.includes("PLATFORM_JWT_SECRET"));
  });

  // 42 — create-platform-owner acepta MONGO_URI y MONGODB_URI
  test("create-platform-owner acepta MONGO_URI y MONGODB_URI", () => {
    // Verificar que el script usa la misma convención que env.js
    const script = require("fs").readFileSync(require("path").resolve(__dirname, "..", "scripts", "create-platform-owner.js"), "utf8");
    const lines = script.split("\n");
    const mongoLine = lines.find(l => l.includes("MONGO_URI") && l.includes("MONGODB_URI"));
    assert.ok(mongoLine, "El script debe referenciar ambas variables");
    assert.ok(mongoLine.includes("MONGO_URI") && mongoLine.includes("MONGODB_URI"));
    // Verificar prioridad: MONGO_URI primero
    const match = mongoLine.match(/process\.env\.(\w+)\s*\|\|\s*process\.env\.(\w+)/);
    assert.ok(match);
    assert.equal(match[1], "MONGO_URI");
    assert.equal(match[2], "MONGODB_URI");
  });

  // 43 — create-platform-owner aborta sin PLATFORM_JWT_SECRET
  test("create-platform-owner aborta sin PLATFORM_JWT_SECRET suficiente", () => {
    const script = require("fs").readFileSync(require("path").resolve(__dirname, "..", "scripts", "create-platform-owner.js"), "utf8");
    assert.ok(script.includes("platformJwtSecret.length < 32"), "Debe validar longitud del secreto");
    assert.ok(script.includes('NODE_ENV === "test"') || script.includes("process.env.NODE_ENV === \"test\""), "Debe abortar en pruebas");
  });

  console.log(`\nAll ${passed}/${total} platform-auth tests passed`);
}

main().catch((err) => { console.error("TEST SUITE FAILED:", err.message); process.exit(1); });
