const { createHash, randomUUID } = require("crypto");

const CHECKOUT_IDEMPOTENCY_MIN_LENGTH = 16;
const CHECKOUT_IDEMPOTENCY_MAX_LENGTH = 128;
const CHECKOUT_LEASE_DURATION_MS = 60_000;
const CHECKOUT_KEY_PATTERN = /^[A-Za-z0-9._~-]+$/;

function validateCheckoutIdempotencyKey(value) {
  const key = typeof value === "string" ? value : "";
  if (!key) return { valid: false, code: "missing_idempotency_key" };
  if (key.length < CHECKOUT_IDEMPOTENCY_MIN_LENGTH || key.length > CHECKOUT_IDEMPOTENCY_MAX_LENGTH) {
    return { valid: false, code: "invalid_idempotency_key_length" };
  }
  if (!CHECKOUT_KEY_PATTERN.test(key)) return { valid: false, code: "invalid_idempotency_key" };
  return { valid: true, key };
}

function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function buildCheckoutScope({ userId, organizationId }) {
  return `commercial-checkout:${String(organizationId || "").trim()}:${String(userId || "").trim()}`;
}

function normalizeCheckoutIntent({ userId, organizationId, planId, paymentMethod, requestTrial, selectedAddOns }) {
  return {
    userId: String(userId || "").trim(),
    organizationId: String(organizationId || "").trim(),
    planId: String(planId || "").trim().toLowerCase(),
    paymentMethod: String(paymentMethod || "").trim().toLowerCase(),
    requestTrial: Boolean(requestTrial),
    selectedAddOns: Array.from(new Set((Array.isArray(selectedAddOns) ? selectedAddOns : [])
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean))).sort()
  };
}

function buildCheckoutRequestFingerprint(intent) {
  return hashValue(JSON.stringify(normalizeCheckoutIntent(intent)));
}

function buildCheckoutKeyHash(scope, key) {
  return hashValue(`${scope}:${key}`);
}

function buildCheckoutReservation({ scope, keyHash, requestFingerprint, workerId, now = new Date() }) {
  return {
    id: randomUUID(),
    scope,
    keyHash,
    requestFingerprint,
    orderId: randomUUID(),
    providerIdempotencyKey: randomUUID(),
    status: "initializing",
    attemptCount: 1,
    leaseOwner: workerId,
    leaseUntil: new Date(now.getTime() + CHECKOUT_LEASE_DURATION_MS),
    createdAt: now,
    updatedAt: now
  };
}

module.exports = {
  CHECKOUT_IDEMPOTENCY_MAX_LENGTH,
  CHECKOUT_IDEMPOTENCY_MIN_LENGTH,
  CHECKOUT_LEASE_DURATION_MS,
  buildCheckoutKeyHash,
  buildCheckoutRequestFingerprint,
  buildCheckoutReservation,
  buildCheckoutScope,
  normalizeCheckoutIntent,
  validateCheckoutIdempotencyKey
};
