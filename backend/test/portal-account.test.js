const assert = require("node:assert/strict");
const { buildSubscription, deriveSubscriptionStatus, pickActiveOrder } = require("../src/services/portal-account");

function order(overrides = {}) {
  return { id: overrides.id || "order", planId: "starter-2", planName: "2 combis", fleetSize: 2, totalPrice: 149, createdAt: "2024-01-01T00:00:00.000Z", ...overrides };
}

function main() {
  const now = new Date("2024-02-15T00:00:00.000Z");
  const paid = order({ id: "paid", paymentStatus: "paid", activationStatus: "active", currentPeriodStart: "2024-02-01T00:00:00.000Z", currentPeriodEnd: "2024-03-01T00:00:00.000Z" });
  const pending = order({ id: "pending", createdAt: "2024-02-10T00:00:00.000Z", paymentStatus: "pending", activationStatus: "pending_payment" });
  const trial = order({ id: "trial", requestTrial: true, paymentStatus: "trial_active", trialStatus: "active", trialStartedAt: "2024-02-01T00:00:00.000Z", trialEndsAt: "2024-02-08T00:00:00.000Z" });
  assert.equal(pickActiveOrder([pending, paid, trial], { now }).id, "paid");
  assert.equal(deriveSubscriptionStatus(trial, { now }), "expired");
  assert.equal(deriveSubscriptionStatus({ ...paid, currentPeriodEnd: "2024-02-15T00:00:00.000Z" }, { now }), "expired");
  assert.equal(deriveSubscriptionStatus({ ...paid, cancelledAt: "2024-02-10T00:00:00.000Z" }, { now }), "cancelled");
  const subscription = buildSubscription(paid, { now });
  assert.equal(subscription.status, "active");
  assert.equal(subscription.currentPeriodStart, "2024-02-01T00:00:00.000Z");
  assert.equal(subscription.currentPeriodEnd, "2024-03-01T00:00:00.000Z");
  assert.equal(subscription.nextBillingAt, "2024-03-01T00:00:00.000Z");
  assert.equal(subscription.isActive, true);
  console.log("portal account projection tests passed");
}

main();
