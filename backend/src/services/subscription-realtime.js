const SUBSCRIPTION_UPDATED_EVENT = "subscription:updated";
const SUBSCRIPTION_UPDATED_VERSION = 1;

const SUBSCRIPTION_UPDATE_REASONS = Object.freeze({
  PLAN_CHANGED: "plan_changed",
  CANCELLATION_SCHEDULED: "cancellation_scheduled",
  PAYMENT_CONFIRMED: "payment_confirmed",
  MANUAL_PAYMENT_APPROVED: "manual_payment_approved"
});

const ALLOWED_REASONS = new Set(Object.values(SUBSCRIPTION_UPDATE_REASONS));

function buildSubscriptionInvalidation({ organizationId, reason, updatedAt = new Date().toISOString() } = {}) {
  const safeOrganizationId = String(organizationId || "").trim();
  const safeReason = String(reason || "").trim();

  if (!safeOrganizationId) {
    throw new Error("organizationId es obligatorio para subscription:updated");
  }
  if (!ALLOWED_REASONS.has(safeReason)) {
    throw new Error("reason invalido para subscription:updated");
  }

  return {
    version: SUBSCRIPTION_UPDATED_VERSION,
    organizationId: safeOrganizationId,
    reason: safeReason,
    updatedAt: String(updatedAt || new Date().toISOString())
  };
}

function emitSubscriptionUpdated({ io, organizationId, reason, updatedAt } = {}) {
  const payload = buildSubscriptionInvalidation({ organizationId, reason, updatedAt });
  io?.to(`org:${payload.organizationId}`).emit(SUBSCRIPTION_UPDATED_EVENT, payload);
  return payload;
}

module.exports = {
  SUBSCRIPTION_UPDATED_EVENT,
  SUBSCRIPTION_UPDATED_VERSION,
  SUBSCRIPTION_UPDATE_REASONS,
  buildSubscriptionInvalidation,
  emitSubscriptionUpdated
};
