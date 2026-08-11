const assert = require("node:assert/strict");
const {
  getCommercialPlanById,
  listCommercialPlans
} = require("../src/config/commercial-plans");
const { CommercialLeadModel } = require("../src/data/models");
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
const {
  DEFAULT_INTERNAL_DEMO_DAYS,
  DEFAULT_INTERNAL_DEMO_PLAN_ID,
  INTERNAL_DEMO_PAYMENT_STATUS,
  INTERNAL_DEMO_PROVIDER,
  buildInternalDemoOrder,
  evaluateInternalDemoGrant,
  isInternalDemoOrder
} = require("../src/services/internal-demo-access");

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

  // El acceso demo interno no altera la política pública: es un paid_test aislado,
  // útil para cuentas de QA/demostración y nunca se ofrece desde Ventas.
  assert.equal(DEFAULT_INTERNAL_DEMO_PLAN_ID, "enterprise-12");
  assert.equal(DEFAULT_INTERNAL_DEMO_DAYS, 30);
  assert.deepEqual(
    evaluateInternalDemoGrant({
      existingOrders: [{ requestTrial: true, trialStatus: "expired", paymentStatus: "trial_active", trialEndsAt: "2024-01-08T00:00:00.000Z" }],
      planId: "enterprise-12",
      durationDays: 30,
      now: new Date("2024-02-01T00:00:00.000Z")
    }),
    {
      allowed: true,
      code: "internal_demo_allowed",
      durationDays: 30,
      planId: "enterprise-12",
      unitsLimit: 12
    }
  );
  assert.equal(
    evaluateInternalDemoGrant({
      existingOrders: [{ paymentStatus: "paid", activationStatus: "active", currentPeriodEnd: "2024-03-01T00:00:00.000Z" }],
      planId: "enterprise-12",
      now: new Date("2024-02-01T00:00:00.000Z")
    }).code,
    "active_real_paid_subscription"
  );

  const demoOrder = buildInternalDemoOrder({
    user: {
      id: "user-demo",
      name: "Eris Demo",
      email: "eris@correo.com",
      phone: "2460000000",
      organizationId: "org-demo",
      companyProfile: { companyName: "ManeComb Demo" }
    },
    existingOrders: [{ requestTrial: true, trialStatus: "expired" }],
    planId: "enterprise-12",
    durationDays: 30,
    now: new Date("2024-02-01T00:00:00.000Z"),
    orderId: "demo-order",
    referenceCode: "MNCB-DEMO-TEST"
  });
  assert.equal(demoOrder.planId, "enterprise-12");
  assert.equal(demoOrder.fleetSize, 12);
  assert.equal(demoOrder.paymentStatus, INTERNAL_DEMO_PAYMENT_STATUS);
  assert.equal(demoOrder.paymentProvider, INTERNAL_DEMO_PROVIDER);
  assert.equal(demoOrder.requestTrial, false);
  assert.equal(demoOrder.trialStatus, "not_requested");
  assert.equal(demoOrder.currentPeriodStart, "2024-02-01T00:00:00.000Z");
  assert.equal(demoOrder.currentPeriodEnd, "2024-03-02T00:00:00.000Z");
  assert.equal(demoOrder.radioFeatureEnabled, true);
  assert.equal(Array.isArray(demoOrder.starterFleet), true);
  assert.equal(demoOrder.starterFleet.length, 12);
  assert.equal(isInternalDemoOrder(demoOrder), true);

  const demoDocument = new CommercialLeadModel(demoOrder);
  const demoValidationError = demoDocument.validateSync();
  assert.equal(
    demoValidationError,
    undefined,
    `La orden demo interna debe cumplir el schema de commercial_leads: ${demoValidationError?.message || ""}`
  );

  console.log("commercial activation policy tests passed");
}

main();
