const { randomUUID } = require("crypto");

const {
  getCommercialPlanById,
  getCommercialPlanPricing
} = require("../config/commercial-plans");
const {
  addDaysToIso,
  buildCommercialActivationUpdate
} = require("./commercial-activation");
const { deriveSubscriptionStatus } = require("./portal-account");

const INTERNAL_DEMO_PROVIDER = "internal_demo";
const INTERNAL_DEMO_PAYMENT_STATUS = "paid_test";
const DEFAULT_INTERNAL_DEMO_PLAN_ID = "enterprise-12";
const DEFAULT_INTERNAL_DEMO_DAYS = 30;
const MAX_INTERNAL_DEMO_DAYS = 90;

function normalizeDemoDays(value) {
  const days = Number(value || DEFAULT_INTERNAL_DEMO_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > MAX_INTERNAL_DEMO_DAYS) {
    const error = new Error(`La duración demo debe ser un entero entre 1 y ${MAX_INTERNAL_DEMO_DAYS} días.`);
    error.code = "invalid_demo_duration";
    throw error;
  }
  return days;
}

function isInternalDemoOrder(order) {
  return String(order?.paymentStatus || "").trim().toLowerCase() === INTERNAL_DEMO_PAYMENT_STATUS
    && String(order?.paymentProvider || "").trim().toLowerCase() === INTERNAL_DEMO_PROVIDER;
}

function isActiveRealPaidOrder(order, { now = new Date() } = {}) {
  const paymentStatus = String(order?.paymentStatus || "").trim().toLowerCase();
  if (paymentStatus !== "paid") return false;
  return deriveSubscriptionStatus(order, { now }) === "active";
}

function evaluateInternalDemoGrant({
  existingOrders = [],
  planId = DEFAULT_INTERNAL_DEMO_PLAN_ID,
  durationDays = DEFAULT_INTERNAL_DEMO_DAYS,
  now = new Date()
} = {}) {
  const plan = getCommercialPlanById(String(planId || "").trim());
  if (!plan) {
    return { allowed: false, code: "demo_plan_not_found" };
  }

  let days;
  try {
    days = normalizeDemoDays(durationDays);
  } catch (error) {
    return { allowed: false, code: error.code || "invalid_demo_duration" };
  }

  if (existingOrders.some((order) => isActiveRealPaidOrder(order, { now }))) {
    return { allowed: false, code: "active_real_paid_subscription" };
  }

  return {
    allowed: true,
    code: "internal_demo_allowed",
    durationDays: days,
    planId: plan.id,
    unitsLimit: Number(plan.units || 0)
  };
}

function assertDemoAccountUser(user) {
  const id = String(user?.id || user?._id || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const organizationId = String(user?.organizationId || "").trim();
  if (!id || !email || !organizationId) {
    const error = new Error("La cuenta demo requiere usuario, correo y organizationId válidos.");
    error.code = "demo_account_identity_incomplete";
    throw error;
  }
  return { id, email, organizationId };
}

function buildInternalDemoOrder({
  user,
  existingOrders = [],
  planId = DEFAULT_INTERNAL_DEMO_PLAN_ID,
  durationDays = DEFAULT_INTERNAL_DEMO_DAYS,
  now = new Date(),
  orderId,
  referenceCode
} = {}) {
  const identity = assertDemoAccountUser(user);
  const decision = evaluateInternalDemoGrant({ existingOrders, planId, durationDays, now });
  if (!decision.allowed) {
    const error = new Error(decision.code);
    error.code = decision.code;
    throw error;
  }

  const plan = getCommercialPlanById(decision.planId);
  const pricing = getCommercialPlanPricing(plan, []);
  const nowIso = new Date(now).toISOString();
  const periodEnd = addDaysToIso(nowIso, decision.durationDays);
  const safeOrderId = String(orderId || `demo-${randomUUID()}`).trim();
  const safeReferenceCode = String(referenceCode || `MNCB-DEMO-${randomUUID().slice(0, 8).toUpperCase()}`).trim();
  const companyName = String(user?.companyProfile?.companyName || user?.name || "Cuenta ManeComb").trim();
  const contactName = String(user?.name || companyName).trim();
  const phone = String(user?.phone || "Por confirmar").trim() || "Por confirmar";

  const baseOrder = {
    id: safeOrderId,
    _id: safeOrderId,
    referenceCode: safeReferenceCode,
    ownerUserId: identity.id,
    ownerAccountEmail: identity.email,
    organizationId: identity.organizationId,
    organizationSlug: identity.organizationId,
    companyName,
    contactName,
    email: identity.email,
    phone,
    billingProfile: user?.companyProfile || {},
    planId: plan.id,
    planName: plan.name,
    fleetSize: Number(plan.units || 0),
    basePlanPrice: Number(plan.price || 0),
    addOns: pricing.addOns,
    addOnsTotal: Number(pricing.addOnsTotal || 0),
    radioFeatureEnabled: Boolean(pricing.radioFeatureEnabled),
    totalPrice: Number(pricing.totalPrice || plan.price || 0),
    pricePerVehicle: Number(plan.pricePerVehicle || 0),
    strategy: String(plan.strategy || "Demo interna"),
    paymentMethod: INTERNAL_DEMO_PROVIDER,
    paymentProvider: INTERNAL_DEMO_PROVIDER,
    paymentStatus: INTERNAL_DEMO_PAYMENT_STATUS,
    paymentApprovedAt: nowIso,
    requestTrial: false,
    trialDays: 0,
    trialStartedAt: null,
    trialEndsAt: null,
    trialStatus: "not_requested",
    needsInvoice: false,
    notes: `Acceso demo interno ${decision.durationDays} días · ${plan.name}.`,
    createdAt: nowIso
  };

  const activation = buildCommercialActivationUpdate(baseOrder, "active", { now });

  return {
    ...baseOrder,
    ...activation,
    requestTrial: false,
    trialDays: 0,
    trialStartedAt: null,
    trialEndsAt: null,
    trialStatus: "not_requested",
    paymentStatus: INTERNAL_DEMO_PAYMENT_STATUS,
    paymentProvider: INTERNAL_DEMO_PROVIDER,
    paymentApprovedAt: nowIso,
    currentPeriodStart: nowIso,
    currentPeriodEnd: periodEnd,
    paidUntil: periodEnd,
    nextBillingAt: null,
    status: "active",
    activationStatus: "active"
  };
}

module.exports = {
  DEFAULT_INTERNAL_DEMO_DAYS,
  DEFAULT_INTERNAL_DEMO_PLAN_ID,
  INTERNAL_DEMO_PAYMENT_STATUS,
  INTERNAL_DEMO_PROVIDER,
  MAX_INTERNAL_DEMO_DAYS,
  buildInternalDemoOrder,
  evaluateInternalDemoGrant,
  isActiveRealPaidOrder,
  isInternalDemoOrder,
  normalizeDemoDays
};
