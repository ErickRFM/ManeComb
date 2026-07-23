const assert = require("node:assert/strict");
const { deriveEntitlementAfterFinancialReversal, derivePaymentFinancialState, evaluateChargebackTransition, reconcileChargebackWithOrder } = require("../src/services/financial-reversal");

const order = { id: "order-1", providerPaymentId: "pay-1", totalPrice: 100, currency: "MXN", currentPeriodEnd: "2027-01-01T00:00:00.000Z" };
const base = { id: "cb-1", payments: ["pay-1"], amount: 100, currency_id: "MXN", status: "open" };

assert.equal(reconcileChargebackWithOrder(base, order).ok, true);
assert.equal(reconcileChargebackWithOrder({ ...base, payments: ["pay-other"] }, order).code, "chargeback_payment_mismatch");
assert.equal(reconcileChargebackWithOrder({ ...base, currency_id: "USD" }, order).code, "chargeback_currency_mismatch");
assert.equal(reconcileChargebackWithOrder({ ...base, amount: 101 }, order).code, "chargeback_amount_mismatch");
assert.deepEqual(evaluateChargebackTransition("open", "open"), { apply: false, reason: "duplicate" });
assert.equal(evaluateChargebackTransition("open", "won").apply, true);
assert.deepEqual(evaluateChargebackTransition("won", "open"), { apply: false, reason: "stale" });

const open = derivePaymentFinancialState({ paidAmountMinor: 10_000, chargebackRecords: [{ status: "open", updatedAt: "2026-01-01T00:00:00.000Z" }] });
assert.equal(open.status, "chargeback_open");
assert.equal(deriveEntitlementAfterFinancialReversal({ order, financialState: open, now: "2026-02-01T00:00:00.000Z" }).action, "suspend");
const won = derivePaymentFinancialState({ paidAmountMinor: 10_000, chargebackRecords: [{ status: "won", updatedAt: "2026-01-02T00:00:00.000Z" }] });
assert.equal(deriveEntitlementAfterFinancialReversal({ order, financialState: won, now: "2026-02-01T00:00:00.000Z" }).action, "restore");
assert.equal(deriveEntitlementAfterFinancialReversal({ order: { ...order, currentPeriodEnd: "2026-01-01T00:00:00.000Z" }, financialState: won, now: "2026-02-01T00:00:00.000Z" }).action, "none");
const lost = derivePaymentFinancialState({ paidAmountMinor: 10_000, chargebackRecords: [{ status: "lost", updatedAt: "2026-01-03T00:00:00.000Z" }] });
assert.equal(deriveEntitlementAfterFinancialReversal({ order, financialState: lost }).action, "suspend");
console.log("chargeback reconciliation and transition tests passed");
