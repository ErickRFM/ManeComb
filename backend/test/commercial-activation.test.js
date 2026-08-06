const assert = require("node:assert/strict");
const {
  getCommercialPlanById,
  listCommercialPlans
} = require("../src/config/commercial-plans");
const {
  addUtcCalendarMonths,
  buildCommercialActivationUpdate,
  buildInitialSubscriptionPeriod,
  evaluateTrialEligibility
} = require("../src/services/commercial-activation");
const {
  TRIAL_DURATION_DAYS,
  TRIAL_PLAN_ID,
  TRIAL_UNITS_LIMIT,
  evaluateTrialPlan
} = require("../src/services/commercial-trial-policy");

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

  const publicPlans = listCommercialPlans();
  const demoPlans = publicPlans.filter((plan) => plan.trialEligible);
  assert.deepEqual(demoPlans.map((plan) => plan.id), [TRIAL_PLAN_ID]);
  assert.equal(demoPlans[0].units, TRIAL_UNITS_LIMIT);
  assert.equal(demoPlans[0].trialDays, TRIAL_DURATION_DAYS);
  assert.equal(publicPlans.filter((plan) => plan.id !== TRIAL_PLAN_ID).every((plan) => plan.trialDays === 0), true);

  const plan = getCommercialPlanById(TRIAL_PLAN_ID);
  assert.deepEqual(evaluateTrialPlan(plan), {
    allowed: true,
    code: "trial_plan_allowed",
    durationDays: 7,
    planId: "starter-2",
    unitsLimit: 2
  });
  assert.equal(evaluateTrialEligibility({ organizationId: "org-1", existingOrders: [], requestedPlan: plan }).eligible, true);
  assert.equal(evaluateTrialEligibility({ organizationId: "org-1", existingOrders: [{ requestTrial: true, trialStatus: "expired" }], requestedPlan: plan }).code, "trial_already_consumed");
  assert.equal(evaluateTrialEligibility({ organizationId: "org-1", existingOrders: [{ paymentStatus: "paid", activationStatus: "active" }], requestedPlan: plan }).code, "paid_subscription_exists");

  for (const planId of ["value-4", "control-6", "premium-8", "enterprise-12"]) {
    const nonTrialPlan = getCommercialPlanById(planId);
    assert.equal(evaluateTrialPlan(nonTrialPlan).allowed, false);
    assert.equal(
      evaluateTrialEligibility({ organizationId: "org-1", existingOrders: [], requestedPlan: nonTrialPlan }).code,
      "trial_only_available_for_starter_2"
    );
  }

  assert.equal(evaluateTrialPlan({ ...plan, units: 4 }).code, "trial_units_policy_mismatch");
  assert.equal(evaluateTrialPlan({ ...plan, trialDays: 14 }).code, "trial_configuration_invalid");
  assert.equal(evaluateTrialPlan({ ...plan, trialEligible: false }).code, "trial_configuration_invalid");

  console.log("commercial activation policy tests passed");
}

main();
