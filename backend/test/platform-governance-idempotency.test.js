process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const {
  ACTION_PROCESSING_TIMEOUT_MS,
  getActionClaimDisposition,
  executeGovernanceAction
} = require("../src/modules/platform/governance-service");

async function main() {
  const now = Date.now();
  const fingerprint = "fingerprint-1";

  assert.equal(
    getActionClaimDisposition({ status: "failed", requestFingerprint: fingerprint }, fingerprint, now),
    "reclaim",
    "Una acción fallida debe poder reclamarse con la misma solicitud"
  );
  assert.equal(
    getActionClaimDisposition({
      status: "processing",
      requestFingerprint: fingerprint,
      processingStartedAt: new Date(now - ACTION_PROCESSING_TIMEOUT_MS - 1)
    }, fingerprint, now),
    "reclaim",
    "Una acción processing abandonada debe poder recuperarse"
  );
  assert.equal(
    getActionClaimDisposition({
      status: "processing",
      requestFingerprint: fingerprint,
      processingStartedAt: new Date(now)
    }, fingerprint, now),
    "processing",
    "Una acción concurrente reciente debe permanecer protegida"
  );
  assert.equal(
    getActionClaimDisposition({
      status: "completed",
      requestFingerprint: fingerprint,
      safeResponse: { ok: true }
    }, fingerprint, now),
    "replay"
  );
  assert.equal(
    getActionClaimDisposition({ status: "failed", requestFingerprint: "another" }, fingerprint, now),
    "conflict",
    "Una misma clave nunca puede reutilizarse con otro payload"
  );

  const store = createEmbeddedStore();
  const owner = store.createPlatformUser({
    name: "Idempotency Owner",
    email: "idempotency-owner@manecomb.com",
    password: "PlatformTest@123",
    role: "platform_owner"
  });
  const support = store.createPlatformUser({
    name: "Idempotency Support",
    email: "idempotency-support@manecomb.com",
    password: "PlatformTest@123",
    role: "platform_support"
  });
  store.listPlatformUsers = () => [owner, support];

  const originalUpdate = store.updatePlatformUser.bind(store);
  let injectTransientFailure = true;
  store.updatePlatformUser = (...args) => {
    if (injectTransientFailure) {
      injectTransientFailure = false;
      throw new Error("transient update failure");
    }
    return originalUpdate(...args);
  };

  const payload = {
    action: "platform.user.suspend",
    targetId: support.id,
    reason: "Falla transitoria controlada para validar un reintento seguro",
    confirmation: "CONFIRM platform.user.suspend"
  };
  const idempotencyKey = "governance-transient-retry-0001";
  const actor = { id: owner.id, role: owner.role };

  await assert.rejects(
    () => executeGovernanceAction(store, actor, idempotencyKey, payload, "owner-session"),
    /transient update failure/
  );

  const retried = await executeGovernanceAction(
    store,
    actor,
    idempotencyKey,
    payload,
    "owner-session"
  );
  assert.equal(retried.replayed, false);
  assert.equal(retried.target.status, "suspended");

  const replayed = await executeGovernanceAction(
    store,
    actor,
    idempotencyKey,
    payload,
    "owner-session"
  );
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.id, retried.id);

  console.log("PASS: failed and stale governance actions recover without losing idempotency");
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
