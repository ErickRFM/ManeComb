const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  SUBSCRIPTION_UPDATED_EVENT,
  SUBSCRIPTION_UPDATED_VERSION,
  SUBSCRIPTION_UPDATE_REASONS,
  buildSubscriptionInvalidation,
  emitSubscriptionUpdated
} = require("../src/services/subscription-realtime");

const fixedNow = "2026-08-09T10:00:00.000Z";
const payload = buildSubscriptionInvalidation({
  organizationId: " org-a ",
  reason: SUBSCRIPTION_UPDATE_REASONS.PAYMENT_CONFIRMED,
  updatedAt: fixedNow
});

assert.deepEqual(payload, {
  version: SUBSCRIPTION_UPDATED_VERSION,
  organizationId: "org-a",
  reason: "payment_confirmed",
  updatedAt: fixedNow
});
assert.deepEqual(Object.keys(payload).sort(), ["organizationId", "reason", "updatedAt", "version"]);

const serializedPayload = JSON.stringify(payload);
for (const forbiddenField of [
  "subscription",
  "monthlyPrice",
  "financialStatus",
  "refundedAmountMinor",
  "refundableAmountMinor",
  "chargebackStatus",
  "currentPeriodStart",
  "currentPeriodEnd",
  "nextBillingAt",
  "cancelAt",
  "cancelledAt"
]) {
  assert.equal(
    serializedPayload.includes(forbiddenField),
    false,
    `subscription:updated must not expose ${forbiddenField}`
  );
}

assert.throws(
  () => buildSubscriptionInvalidation({ reason: SUBSCRIPTION_UPDATE_REASONS.PLAN_CHANGED }),
  /organizationId es obligatorio/
);
assert.throws(
  () => buildSubscriptionInvalidation({ organizationId: "org-a", reason: "raw_financial_snapshot" }),
  /reason invalido/
);

const emissions = [];
const io = {
  to(room) {
    return {
      emit(eventName, eventPayload) {
        emissions.push({ room, eventName, eventPayload });
      }
    };
  }
};

const emittedPayload = emitSubscriptionUpdated({
  io,
  organizationId: "org-a",
  reason: SUBSCRIPTION_UPDATE_REASONS.PLAN_CHANGED,
  updatedAt: fixedNow
});

assert.equal(emissions.length, 1, "subscription invalidation must be emitted exactly once");
assert.deepEqual(emissions[0], {
  room: "org:org-a",
  eventName: SUBSCRIPTION_UPDATED_EVENT,
  eventPayload: emittedPayload
});
assert.equal(Object.prototype.hasOwnProperty.call(emittedPayload, "subscription"), false);

const backendSrc = path.join(__dirname, "../src");
const canonicalService = path.normalize(path.join(backendSrc, "services/subscription-realtime.js"));
const directLiteralViolations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    if (path.normalize(absolutePath) === canonicalService) continue;

    const source = fs.readFileSync(absolutePath, "utf8");
    if (source.includes(SUBSCRIPTION_UPDATED_EVENT)) {
      directLiteralViolations.push(path.relative(backendSrc, absolutePath));
    }
  }
}

walk(backendSrc);
assert.deepEqual(
  directLiteralViolations,
  [],
  `subscription:updated must be emitted only through services/subscription-realtime.js; violations: ${directLiteralViolations.join(", ")}`
);

console.log("subscription realtime tests passed");
