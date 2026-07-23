const crypto = require("node:crypto");

const REFUND_LEASE_MS = 60_000;

function hashRefundKey(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function buildRefundFingerprint({ organizationId, orderId, amountMinor }) {
  return crypto.createHash("sha256").update(JSON.stringify({ organizationId, orderId, amountMinor: amountMinor ?? null })).digest("hex");
}

function derivePaymentFinancialState({ paidAmountMinor, refundRecords = [], chargebackRecords = [] }) {
  const confirmedRefunds = refundRecords.filter((entry) => entry.status === "confirmed");
  const refundedAmountMinor = confirmedRefunds.reduce((total, entry) => total + Number(entry.amountMinor || 0), 0);
  const chargebacks = [...chargebackRecords].sort((a, b) => new Date(b.updatedAt || b.openedAt || 0) - new Date(a.updatedAt || a.openedAt || 0));
  const latestChargeback = chargebacks[0] || null;
  const chargebackStatus = String(latestChargeback?.status || "").toLowerCase();
  let status = refundedAmountMinor >= paidAmountMinor && paidAmountMinor > 0 ? "refunded" : refundedAmountMinor > 0 ? "partially_refunded" : "paid";
  if (["open", "in_process", "in_review"].includes(chargebackStatus)) status = "chargeback_open";
  if (["won", "covered", "closed_won"].includes(chargebackStatus)) status = "chargeback_won";
  if (["lost", "closed_lost"].includes(chargebackStatus)) status = "chargeback_lost";
  return { status, refundedAmountMinor, refundableAmountMinor: Math.max(0, paidAmountMinor - refundedAmountMinor), chargebackStatus: chargebackStatus || null };
}

function evaluateChargebackTransition(currentStatus, incomingStatus) {
  const current = String(currentStatus || "").toLowerCase();
  const incoming = String(incomingStatus || "").toLowerCase();
  const terminal = new Set(["won", "lost", "covered", "closed_won", "closed_lost"]);
  if (!incoming) return { apply: false, reason: "unknown_status" };
  if (current === incoming) return { apply: false, reason: "duplicate" };
  if (terminal.has(current) && !terminal.has(incoming)) return { apply: false, reason: "stale" };
  return { apply: true, reason: "transition" };
}

function deriveEntitlementAfterFinancialReversal({ order, financialState, now = new Date() }) {
  const periodValid = !order?.currentPeriodEnd || new Date(now).getTime() < new Date(order.currentPeriodEnd).getTime();
  const cancelled = Boolean(order?.cancelledAt) || ["cancelled", "canceled"].includes(String(order?.status || "").toLowerCase());
  if (["refunded", "chargeback_lost"].includes(financialState.status)) return { action: "suspend", activationStatus: "suspended_financial", serviceSuspendedReason: financialState.status };
  if (financialState.status === "chargeback_open") return { action: "suspend", activationStatus: "suspended_financial", serviceSuspendedReason: "chargeback_open" };
  if (financialState.status === "chargeback_won" && periodValid && !cancelled && Number(financialState.refundableAmountMinor) > 0) {
    return { action: "restore", activationStatus: "active", serviceSuspendedReason: null };
  }
  return { action: "none" };
}

function normalizeChargeback(providerChargeback) {
  const paymentId = String(providerChargeback?.payments?.[0] || providerChargeback?.payment_id || "").trim();
  const currency = String(providerChargeback?.currency_id || "").trim().toUpperCase();
  const amount = Number(providerChargeback?.amount);
  return {
    providerChargebackId: String(providerChargeback?.id || "").trim(),
    providerPaymentId: paymentId,
    amountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null,
    currency,
    status: String(providerChargeback?.status || "").trim().toLowerCase(),
    coverageEligible: providerChargeback?.coverage_eligible === true,
    documentationRequired: providerChargeback?.documentation_required === true,
    documentationDeadline: providerChargeback?.documentation_deadline || null
  };
}

function reconcileChargebackWithOrder(chargeback, order) {
  const normalized = normalizeChargeback(chargeback);
  const expectedAmountMinor = Math.round(Number(order?.totalPrice || 0) * 100);
  if (!normalized.providerChargebackId) return { ok: false, code: "invalid_chargeback_id" };
  if (!normalized.providerPaymentId || normalized.providerPaymentId !== String(order?.providerPaymentId || "")) return { ok: false, code: "chargeback_payment_mismatch" };
  if (normalized.currency !== String(order?.currency || "MXN").toUpperCase()) return { ok: false, code: "chargeback_currency_mismatch" };
  if (!Number.isInteger(normalized.amountMinor) || normalized.amountMinor <= 0 || normalized.amountMinor > expectedAmountMinor) return { ok: false, code: "chargeback_amount_mismatch" };
  return { ok: true, normalized };
}

module.exports = {
  REFUND_LEASE_MS,
  buildRefundFingerprint,
  deriveEntitlementAfterFinancialReversal,
  derivePaymentFinancialState,
  evaluateChargebackTransition,
  hashRefundKey,
  normalizeChargeback,
  reconcileChargebackWithOrder
};
