const TRIAL_PLAN_ID = "starter-2";
const TRIAL_UNITS_LIMIT = 2;
const TRIAL_DURATION_DAYS = 7;

function evaluateTrialPlan(plan) {
  if (!plan) {
    return { allowed: false, code: "trial_plan_required" };
  }

  const planId = String(plan.id || "").trim();
  const units = Number(plan.units || 0);
  const trialDays = Number(plan.trialDays || 0);

  if (planId !== TRIAL_PLAN_ID) {
    return { allowed: false, code: "trial_only_available_for_starter_2" };
  }

  if (units !== TRIAL_UNITS_LIMIT) {
    return { allowed: false, code: "trial_units_policy_mismatch" };
  }

  if (trialDays !== TRIAL_DURATION_DAYS || plan.trialEligible !== true) {
    return { allowed: false, code: "trial_configuration_invalid" };
  }

  return {
    allowed: true,
    code: "trial_plan_allowed",
    durationDays: TRIAL_DURATION_DAYS,
    planId: TRIAL_PLAN_ID,
    unitsLimit: TRIAL_UNITS_LIMIT
  };
}

function assertTrialPlan(plan) {
  const result = evaluateTrialPlan(plan);
  if (result.allowed) return result;

  const error = new Error("La prueba gratuita solo está disponible para el plan de 2 combis durante 7 días.");
  error.code = result.code;
  throw error;
}

module.exports = {
  TRIAL_DURATION_DAYS,
  TRIAL_PLAN_ID,
  TRIAL_UNITS_LIMIT,
  assertTrialPlan,
  evaluateTrialPlan
};
