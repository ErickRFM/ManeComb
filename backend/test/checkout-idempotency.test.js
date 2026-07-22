const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const {
  buildCheckoutKeyHash,
  buildCheckoutRequestFingerprint,
  buildCheckoutScope,
  validateCheckoutIdempotencyKey
} = require("../src/services/checkout-idempotency");

async function main() {
  assert.equal(validateCheckoutIdempotencyKey(undefined).code, "missing_idempotency_key");
  assert.equal(validateCheckoutIdempotencyKey("").code, "missing_idempotency_key");
  assert.equal(validateCheckoutIdempotencyKey("short").code, "invalid_idempotency_key_length");
  assert.equal(validateCheckoutIdempotencyKey("x".repeat(129)).code, "invalid_idempotency_key_length");
  assert.equal(validateCheckoutIdempotencyKey("valid key with spaces").code, "invalid_idempotency_key");
  assert.equal(validateCheckoutIdempotencyKey("checkout-valid-key-0001").valid, true);

  const intent = { userId: "user-1", organizationId: "org-1", planId: "STARTER-2", paymentMethod: "CARD", requestTrial: false, selectedAddOns: ["radio_dispatch", "radio_dispatch"] };
  const reordered = { ...intent, selectedAddOns: ["radio_dispatch"] };
  assert.equal(buildCheckoutRequestFingerprint(intent), buildCheckoutRequestFingerprint(reordered));
  assert.notEqual(buildCheckoutRequestFingerprint(intent), buildCheckoutRequestFingerprint({ ...intent, requestTrial: true }));

  const scope = buildCheckoutScope(intent);
  const keyHash = buildCheckoutKeyHash(scope, "checkout-valid-key-0001");
  assert.equal(keyHash.length, 64);
  assert.equal(keyHash.includes("checkout-valid-key-0001"), false);

  const store = createEmbeddedStore();
  const first = store.claimCheckoutCreation({ scope, keyHash, requestFingerprint: buildCheckoutRequestFingerprint(intent), workerId: "worker-1", now: new Date("2026-01-01T00:00:00Z") });
  assert.equal(first.claimed, true);
  assert.equal(first.reason, "new");
  const blocked = store.claimCheckoutCreation({ scope, keyHash, requestFingerprint: buildCheckoutRequestFingerprint(intent), workerId: "worker-2", now: new Date("2026-01-01T00:00:30Z") });
  assert.equal(blocked.reason, "currently_processing");
  const conflict = store.claimCheckoutCreation({ scope, keyHash, requestFingerprint: buildCheckoutRequestFingerprint({ ...intent, planId: "value-4" }), workerId: "worker-2", now: new Date("2026-01-01T00:00:30Z") });
  assert.equal(conflict.reason, "key_reused");
  const recovered = store.claimCheckoutCreation({ scope, keyHash, requestFingerprint: buildCheckoutRequestFingerprint(intent), workerId: "worker-2", now: new Date("2026-01-01T00:01:01Z") });
  assert.equal(recovered.claimed, true);
  assert.equal(recovered.reason, "expired_lease");
  assert.equal(recovered.reservation.orderId, first.reservation.orderId);
  assert.equal(recovered.reservation.attemptCount, 2);
  const ready = store.completeCheckoutCreation({ reservationId: recovered.reservation.id, workerId: "worker-2", safeResponse: { id: recovered.reservation.orderId } });
  assert.equal(ready.status, "ready");
  const replay = store.claimCheckoutCreation({ scope, keyHash, requestFingerprint: buildCheckoutRequestFingerprint(intent), workerId: "worker-3" });
  assert.equal(replay.reason, "ready");
  assert.equal(replay.reservation.safeResponse.id, first.reservation.orderId);

  const otherScope = buildCheckoutScope({ userId: "user-2", organizationId: "org-2" });
  const otherClaim = store.claimCheckoutCreation({ scope: otherScope, keyHash: buildCheckoutKeyHash(otherScope, "checkout-valid-key-0001"), requestFingerprint: buildCheckoutRequestFingerprint({ ...intent, userId: "user-2", organizationId: "org-2" }), workerId: "worker-other" });
  assert.equal(otherClaim.claimed, true);

  console.log("checkout idempotency tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
