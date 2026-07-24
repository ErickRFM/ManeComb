process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const assert = require("node:assert/strict");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const passed = { count: 0 };
const total = { count: 0 };

function test(name, fn) {
  total.count++;
  try { fn(); passed.count++; console.log("PASS:", name); }
  catch (err) { console.error("FAIL:", name, "-", err.message); process.exit(1); }
}

async function testAsync(name, fn) {
  total.count++;
  try { await fn(); passed.count++; console.log("PASS:", name); }
  catch (err) { console.error("FAIL:", name, "-", err.message); process.exit(1); }
}

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

// =====================================================
// SECTION A: Fail-closed (no encryption key)
// =====================================================
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "";
delete require.cache[require.resolve("../src/config/env")];
delete require.cache[require.resolve("../src/utils/platform-mfa-crypto")];
delete require.cache[require.resolve("../src/modules/platform/platform-mfa-service")];
delete require.cache[require.resolve("../src/modules/platform/platform-auth-service")];

const { createEmbeddedStore } = require("../src/data/store");
const { signPlatformToken, signPlatformChallengeToken, verifyPlatformToken, verifyPlatformChallengeToken } = require("../src/utils/platform-jwt");
const { generateTOTP, verifyTOTP, generateBase32Secret, generateTOTPUri, TOTP_PERIOD } = require("../src/utils/platform-totp");
const { createPlatformSession, getPlatformSessionById, markPlatformSessionMfaVerified } = require("../src/services/platform-sessions");
const { recordPlatformAction } = require("../src/services/platform-audit");

const mfaCryptoEmpty = require("../src/utils/platform-mfa-crypto");
const mfaServiceEmpty = require("../src/modules/platform/platform-mfa-service");

test("isMfaEncryptionKeyValid false sin clave", () => {
  assert.ok(!mfaCryptoEmpty.isMfaEncryptionKeyValid());
});

test("isMfaOperational false sin clave", () => {
  assert.ok(!mfaServiceEmpty.isMfaOperational());
});

// Now reload with valid key for all remaining tests
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";
delete require.cache[require.resolve("../src/config/env")];
delete require.cache[require.resolve("../src/utils/platform-mfa-crypto")];
delete require.cache[require.resolve("../src/modules/platform/platform-mfa-service")];
delete require.cache[require.resolve("../src/modules/platform/platform-auth-service")];

const { isMfaRequired, mfaSetup, mfaConfirm, mfaVerify, mfaRecovery } = require("../src/modules/platform/platform-mfa-service");
const platformAuthService = require("../src/modules/platform/platform-auth-service");
const mfaCrypto = require("../src/utils/platform-mfa-crypto");
const { platformAuth, requireMfa, sanitizePlatformUser } = require("../src/middlewares/platform-auth");
const { platformMfaChallenge } = require("../src/middlewares/platform-mfa-challenge");

let store = createEmbeddedStore();
store.createPlatformUser({ name: "MFA Admin", email: "mfa-admin@manecomb.com", password: "Test@1234!secure", role: "platform_admin" });
store.createPlatformUser({ name: "MFA Viewer", email: "mfa-viewer@manecomb.com", password: "Test@1234!secure", role: "platform_viewer" });
store.createPlatformUser({ name: "MFA Owner", email: "mfa-owner@manecomb.com", password: "Test@1234!secure", role: "platform_owner" });
let req = mockReq();

const mfaAdmin = () => store.getPlatformUserByEmail("mfa-admin@manecomb.com");
const mfaOwner = () => store.getPlatformUserByEmail("mfa-owner@manecomb.com");

// =====================================================
// 1. MFA key validation
// =====================================================
test("isMfaEncryptionKeyValid true con clave correcta", () => {
  assert.ok(mfaCrypto.isMfaEncryptionKeyValid());
});

// =====================================================
// 2. AES-256-GCM encryption
// =====================================================
test("encrypt/decrypt roundtrip", () => {
  const original = "JBSWY3DPEHPK3PXP";
  const encrypted = mfaCrypto.encrypt(original);
  assert.ok(encrypted);
  assert.notEqual(encrypted, original);
  const decrypted = mfaCrypto.decrypt(encrypted);
  assert.equal(decrypted, original);
});

test("encrypt produce distintos ciphertexts", () => {
  const original = "JBSWY3DPEHPK3PXP";
  const e1 = mfaCrypto.encrypt(original);
  const e2 = mfaCrypto.encrypt(original);
  assert.notEqual(e1, e2);
});

test("decrypt con datos corruptos lanza error", () => {
  assert.throws(() => mfaCrypto.decrypt("aW52YWxpZA=="));
});

// =====================================================
// 3. TOTP utilities
// =====================================================
test("generateBase32Secret produce string Base32", () => {
  const secret = generateBase32Secret();
  assert.ok(secret);
  assert.ok(secret.length > 0);
  assert.match(secret, /^[A-Z2-7]+=*$/);
});

test("verifyTOTP con token correcto del mismo instante", () => {
  const secret = generateBase32Secret();
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const token = generateTOTP(secret, counter);
  assert.ok(verifyTOTP(token, secret, Date.now()));
});

test("verifyTOTP con token incorrecto", () => {
  const secret = generateBase32Secret();
  assert.ok(!verifyTOTP("000000", secret, Date.now()));
});

test("verifyTOTP con token dentro de la ventana", () => {
  const secret = generateBase32Secret();
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const token = generateTOTP(secret, counter + 1);
  assert.ok(verifyTOTP(token, secret, Date.now()));
});

test("generateTOTPUri incluye issuer y email", () => {
  const secret = generateBase32Secret();
  const uri = generateTOTPUri(secret, "test@manecomb.com");
  assert.ok(uri.includes("issuer=ManeComb"));
  assert.ok(uri.includes("test%40manecomb.com"));
  assert.ok(uri.startsWith("otpauth://totp/"));
});

// =====================================================
// 4. MFA required detection
// =====================================================
test("isMfaRequired true para platform_owner", () => {
  assert.ok(isMfaRequired("platform_owner"));
});

test("isMfaRequired true para platform_admin", () => {
  assert.ok(isMfaRequired("platform_admin"));
});

test("isMfaRequired false para platform_viewer", () => {
  assert.ok(!isMfaRequired("platform_viewer"));
});

test("isMfaRequired false para platform_support", () => {
  assert.ok(!isMfaRequired("platform_support"));
});

test("isMfaRequired false para platform_finance", () => {
  assert.ok(!isMfaRequired("platform_finance"));
});

test("isMfaRequired false para null", () => {
  assert.ok(!isMfaRequired(null));
});

async function runAll() {

// =====================================================
// 5. MFA Setup flow
// =====================================================
await testAsync("mfaSetup devuelve secret y uri", async () => {
  const result = await mfaSetup(mfaAdmin()._id, req);
  assert.ok(result.secret);
  assert.ok(result.uri);
  assert.ok(result.uri.includes(result.secret));
  assert.ok(mfaAdmin().mfaSecretEncrypted);
});

await testAsync("mfaSetup regenera secret si no está confirmado", async () => {
  const firstSecret = mfaAdmin().mfaSecretEncrypted;
  const result = await mfaSetup(mfaAdmin()._id, req);
  assert.ok(result.secret);
  assert.ok(result.uri);
  assert.notEqual(mfaAdmin().mfaSecretEncrypted, firstSecret);
});

await testAsync("mfaConfirm con TOTP inválido falla", async () => {
  const result = await mfaConfirm(mfaAdmin()._id, "000000", req);
  assert.equal(result.error, "Código inválido");
  assert.equal(result.status, 401);
  assert.equal(mfaAdmin().mfaFailedAttempts, 1);
});

await testAsync("mfaConfirm con TOTP válido habilita MFA", async () => {
  const decrypted = mfaCrypto.decrypt(mfaAdmin().mfaSecretEncrypted);
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const token = generateTOTP(decrypted, counter);
  const result = await mfaConfirm(mfaAdmin()._id, token, req);
  assert.ok(result.backupCodes);
  assert.equal(result.backupCodes.length, 10);
  assert.ok(mfaAdmin().mfaEnabled);
  assert.ok(!mfaAdmin().mfaEnrollmentRequired);
  assert.ok(mfaAdmin().mfaSetupCompletedAt);
  assert.equal(mfaAdmin().mfaBackupCodes.length, 10);
});

await testAsync("mfaConfirm falla si MFA ya está habilitado", async () => {
  const result = await mfaConfirm(mfaAdmin()._id, "000000", req);
  assert.equal(result.error, "MFA ya está habilitado");
  assert.equal(result.status, 409);
});

// =====================================================
// 6. Login flow with MFA
// =====================================================
await testAsync("login con MFA requerido devuelve challenge token", async () => {
  const result = await platformAuthService.login("mfa-admin@manecomb.com", "Test@1234!secure", req);
  assert.ok(result.mfaRequired);
  assert.ok(!result.mfaNeedsSetup);
  assert.ok(result.challengeToken);
  assert.ok(result.refreshToken);
  assert.ok(result.session);
  assert.ok(result.session.id);
  assert.ok(!result.token);
});

await testAsync("login con role sin MFA devuelve token normal", async () => {
  const result = await platformAuthService.login("mfa-viewer@manecomb.com", "Test@1234!secure", req);
  assert.ok(!result.mfaRequired);
  assert.ok(result.token);
  assert.ok(result.refreshToken);
});

await testAsync("login con owner que necesita setup devuelve needsSetup", async () => {
  const result = await platformAuthService.login("mfa-owner@manecomb.com", "Test@1234!secure", req);
  assert.ok(result.mfaRequired);
  assert.ok(result.mfaNeedsSetup);
  assert.ok(result.challengeToken);
  assert.ok(!result.token);
});

// =====================================================
// 7. MFA verify flow
// =====================================================
await testAsync("mfaVerify con TOTP válido devuelve platform token", async () => {
  const loginResult = await platformAuthService.login("mfa-admin@manecomb.com", "Test@1234!secure", req);
  const decrypted = mfaCrypto.decrypt(mfaAdmin().mfaSecretEncrypted);
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const token = generateTOTP(decrypted, counter);

  const verifyReq = mockReq({ body: { challengeToken: loginResult.challengeToken, token } });
  const result = await mfaVerify(verifyReq);
  assert.ok(result.token);
  assert.ok(!result.error);
  assert.ok(result.user);
  assert.ok(result.user.mfaEnabled);

  const session = await getPlatformSessionById(loginResult.session.id);
  assert.ok(session.mfaVerified);
});

await testAsync("mfaVerify con TOTP inválido falla", async () => {
  const loginResult = await platformAuthService.login("mfa-admin@manecomb.com", "Test@1234!secure", req);
  const verifyReq = mockReq({ body: { challengeToken: loginResult.challengeToken, token: "000000" } });
  const result = await mfaVerify(verifyReq);
  assert.equal(result.error, "Código inválido");
  assert.equal(result.status, 401);
});

await testAsync("mfaVerify sin challenge token falla", async () => {
  const verifyReq = mockReq({ body: { token: "123456" } });
  const result = await mfaVerify(verifyReq);
  assert.equal(result.error, "Challenge token y código MFA requeridos");
  assert.equal(result.status, 400);
});

await testAsync("mfaVerify sin token falla", async () => {
  const verifyReq = mockReq({ body: { challengeToken: "abc" } });
  const result = await mfaVerify(verifyReq);
  assert.equal(result.error, "Challenge token y código MFA requeridos");
  assert.equal(result.status, 400);
});

// =====================================================
// 8. Recovery codes
// =====================================================
await testAsync("mfaRecovery con código inválido falla", async () => {
  const loginResult = await platformAuthService.login("mfa-admin@manecomb.com", "Test@1234!secure", req);
  const recoveryReq = mockReq({ body: { challengeToken: loginResult.challengeToken, recoveryCode: "codigo-invalido" } });
  const result = await mfaRecovery(recoveryReq);
  assert.equal(result.error, "Código de recuperación inválido");
  assert.equal(result.status, 401);
});

await testAsync("mfaRecovery sin challenge token falla", async () => {
  const recoveryReq = mockReq({ body: { recoveryCode: "code" } });
  const result = await mfaRecovery(recoveryReq);
  assert.equal(result.error, "Challenge token y código de recuperación requeridos");
  assert.equal(result.status, 400);
});

// =====================================================
// 9. Challenge token validation
// =====================================================
test("challenge token tiene tokenType platform_mfa_challenge", () => {
  const token = signPlatformChallengeToken({ id: "test-id", role: "platform_admin" }, "session-1");
  const decoded = jwt.decode(token);
  assert.equal(decoded.tokenType, "platform_mfa_challenge");
});

test("verifyPlatformToken decodifica challenge token pero tokenType no es platform", () => {
  const token = signPlatformChallengeToken({ id: "test-id", role: "platform_admin" }, "session-1");
  const decoded = verifyPlatformToken(token);
  assert.ok(decoded);
  assert.notEqual(decoded.tokenType, "platform");
  assert.equal(decoded.tokenType, "platform_mfa_challenge");
});

test("verifyPlatformChallengeToken decodifica platform token pero tokenType no coincide", () => {
  const token = signPlatformToken({ id: "test-id", _id: "test-id", role: "platform_admin" }, "session-1");
  const decoded = verifyPlatformChallengeToken(token);
  assert.ok(decoded);
  assert.notEqual(decoded.tokenType, "platform_mfa_challenge");
  assert.equal(decoded.tokenType, "platform");
});

// =====================================================
// 10. Rate limiting
// =====================================================
store.createPlatformUser({ name: "Rate Limit Test", email: "rate-limit@manecomb.com", password: "Test@1234!secure", role: "platform_admin" });
const rateUser = () => store.getPlatformUserByEmail("rate-limit@manecomb.com");

await testAsync("rate limit setup secret", async () => {
  const result = await mfaSetup(rateUser()._id, req);
  assert.ok(result.secret);
  assert.ok(rateUser().mfaSecretEncrypted);
});

await testAsync("rate limit se activa tras mfaFailedAttempts >= 5", async () => {
  for (let i = 0; i < 5; i++) {
    await mfaConfirm(rateUser()._id, "000000", req);
  }
  const result = await mfaConfirm(rateUser()._id, "000000", req);
  assert.equal(result.error, "Demasiados intentos MFA. Intenta de nuevo más tarde.");
  assert.equal(result.status, 429);
});

// =====================================================
// 11. requireMfa middleware
// =====================================================
test("requireMfa rechaza sin session.mfaVerified", async () => {
  const res = mockRes();
  const testReq = { platformSession: { mfaVerified: false } };
  await requireMfa(testReq, res, () => {});
  assert.equal(res.state.statusCode, 403);
  assert.equal(res.state.body.message, "MFA requerido para esta acción");
});

test("requireMfa permite con mfaVerified true", async () => {
  const res = mockRes();
  let called = false;
  const testReq = { platformSession: { mfaVerified: true } };
  await requireMfa(testReq, res, () => { called = true; });
  assert.ok(called);
});

test("requireMfa rechaza sin sesión", async () => {
  const res = mockRes();
  const testReq = {};
  await requireMfa(testReq, res, () => {});
  assert.equal(res.state.statusCode, 401);
});

// =====================================================
// 12. platformMfaChallenge middleware
// =====================================================
test("platformMfaChallenge falla sin header", async () => {
  const res = mockRes();
  const testReq = mockReq();
  testReq.app.locals.store = store;
  await platformMfaChallenge(testReq, res, () => {});
  assert.equal(res.state.statusCode, 401);
});

test("platformMfaChallenge falla con token de plataforma normal", async () => {
  const token = signPlatformToken({ id: "test", _id: "test", role: "platform_admin" }, "session-1");
  const res = mockRes();
  const testReq = mockReq({ headers: { authorization: `Bearer ${token}` } });
  testReq.app.locals.store = store;
  await platformMfaChallenge(testReq, res, () => {});
  assert.equal(res.state.statusCode, 401);
});

test("platformMfaChallenge falla con challenge token de sesión inválida", async () => {
  const token = signPlatformChallengeToken({ id: "no-existe", role: "platform_admin" }, "session-no-existe");
  const res = mockRes();
  const testReq = mockReq({ headers: { authorization: `Bearer ${token}` } });
  testReq.app.locals.store = store;
  await platformMfaChallenge(testReq, res, () => {});
  assert.equal(res.state.statusCode, 401);
});

// =====================================================
// 13. sanitizePlatformUser incluye MFA fields
// =====================================================
test("sanitizePlatformUser incluye mfaEnabled y mfaEnrollmentRequired", () => {
  const raw = { _id: "test", name: "Test", email: "test@test.com", role: "platform_admin", status: "active", createdAt: new Date(), lastLoginAt: null, mfaEnabled: true, mfaEnrollmentRequired: false };
  const sanitized = sanitizePlatformUser(raw);
  assert.equal(sanitized.mfaEnabled, true);
  assert.equal(sanitized.mfaEnrollmentRequired, false);
});

// =====================================================
// Summary
// =====================================================
console.log(`\nResultados: ${passed.count}/${total.count} pruebas pasaron`);
if (passed.count !== total.count) process.exit(1);
}

runAll().catch((error) => {
  console.error("Error fatal:", error);
  process.exit(1);
});
