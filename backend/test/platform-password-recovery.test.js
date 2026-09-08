const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { createEmbeddedStore } = require("../src/data/store");
const {
  requestPasswordReset,
  resetPassword
} = require("../src/modules/platform/platform-auth-service");
const {
  createPlatformSession,
  getPlatformSessionById
} = require("../src/services/platform-sessions");

async function main() {
  const store = createEmbeddedStore();
  const user = store.createPlatformUser({
    name: "Recovery Admin",
    email: "recovery-admin@manecomb.com",
    password: "PlatformTest@123",
    role: "platform_admin"
  });
  const req = {
    headers: { "user-agent": "platform-password-recovery-test" },
    ip: "127.0.0.1",
    body: {},
    app: { locals: { store } }
  };

  const unknown = await requestPasswordReset("missing@manecomb.com", req);
  assert.equal(unknown.accepted, true);
  assert.equal(unknown.token, undefined);

  const request = await requestPasswordReset(user.email, req);
  assert.equal(request.accepted, true);
  assert.ok(request.token);
  assert.ok(request.requestId);
  assert.equal(request.user.email, user.email);

  const weak = await resetPassword(request.token, "123", req);
  assert.equal(weak.status, 400);

  const { session } = await createPlatformSession(user.id || user._id, req);
  const nextPassword = "NuevaPlatform@12345";
  const completed = await resetPassword(request.token, nextPassword, req);
  assert.equal(completed.message, "Contraseña actualizada. Inicia sesión nuevamente.");
  assert.ok(completed.revokedCount >= 1);

  const updated = store.getPlatformUserByEmail(user.email);
  assert.equal(bcrypt.compareSync(nextPassword, updated.passwordHash), true);
  assert.ok(updated.passwordChangedAt);
  assert.equal(updated.failedLoginAttempts, 0);
  assert.equal(updated.lockedUntil, null);

  const revoked = await getPlatformSessionById(session.id);
  assert.equal(revoked.isActive, false);
  assert.equal(revoked.revokedReason, "password_reset");

  const reused = await resetPassword(request.token, "OtraPlatform@12345", req);
  assert.equal(reused.status, 400);
  assert.match(reused.error, /ya fue utilizado|expirado/i);

  console.log("PASS: platform password recovery is neutral, expiring and single-use by password version");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
