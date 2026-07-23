const assert = require("node:assert/strict");
const {
  addUtcCalendarMonths,
  buildCommercialActivationUpdate,
  buildInitialSubscriptionPeriod,
  evaluateTrialEligibility
} = require("../src/services/commercial-activation");

function main() {
  assert.equal(addUtcCalendarMonths("2024-01-31T12:00:00.000Z", 1), "2024-02-29T12:00:00.000Z");
  assert.equal(addUtcCalendarMonths("2023-01-31T12:00:00.000Z", 1), "2023-02-28T12:00:00.000Z");
  assert.equal(addUtcCalendarMonths("2024-03-31T12:00:00.000Z", 1), "2024-04-30T12:00:00.000Z");
  assert.equal(addUtcCalendarMonths("2024-12-31T12:00:00.000Z", 1), "2025-01-31T12:00:00.000Z");

  const period = buildInitialSubscriptionPeriod({ activatedAt: "2024-01-31T12:00:00.000Z" });
  assert.equal(period.currentPeriodStart, "2024-01-31T12:00:00.000Z");
  assert.equal(period.currentPeriodEnd, "2024-02-29T12:00:00.000Z");
  assert.equal(period.nextBillingAt, period.currentPeriodEnd);

  const first = buildCommercialActivationUpdate({ paymentStatus: "paid", fleetSize: 2 }, "active", { now: new Date("2024-01-31T12:00:00.000Z") });
  const replay = buildCommercialActivationUpdate({ paymentStatus: "paid", fleetSize: 2, ...first }, "active", { now: new Date("2024-02-02T12:00:00.000Z") });
  assert.equal(replay.currentPeriodStart, first.currentPeriodStart);
  assert.equal(replay.currentPeriodEnd, first.currentPeriodEnd);

  const plan = { id: "starter-2", trialEligible: true, trialDays: 7 };
  assert.equal(evaluateTrialEligibility({ organizationId: "org-1", existingOrders: [], requestedPlan: plan }).eligible, true);
  assert.equal(evaluateTrialEligibility({ organizationId: "org-1", existingOrders: [{ requestTrial: true, trialStatus: "expired" }], requestedPlan: plan }).code, "trial_already_consumed");
  assert.equal(evaluateTrialEligibility({ organizationId: "org-1", existingOrders: [{ paymentStatus: "paid", activationStatus: "active" }], requestedPlan: plan }).code, "paid_subscription_exists");
  assert.equal(evaluateTrialEligibility({ organizationId: "org-1", existingOrders: [], requestedPlan: { ...plan, trialEligible: false } }).code, "trial_plan_not_eligible");

  console.log("commercial activation policy tests passed");
}

main();
