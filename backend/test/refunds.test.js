const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const { buildRefundFingerprint, deriveEntitlementAfterFinancialReversal, derivePaymentFinancialState, hashRefundKey } = require("../src/services/financial-reversal");

async function main() {
  const partial = derivePaymentFinancialState({ paidAmountMinor: 10_000, refundRecords: [{ status: "confirmed", amountMinor: 2_500 }] });
  assert.deepEqual(partial, { status: "partially_refunded", refundedAmountMinor: 2_500, refundableAmountMinor: 7_500, chargebackStatus: null });
  assert.equal(deriveEntitlementAfterFinancialReversal({ order: {}, financialState: partial }).action, "none");
  const full = derivePaymentFinancialState({ paidAmountMinor: 10_000, refundRecords: [{ status: "confirmed", amountMinor: 2_500 }, { status: "confirmed", amountMinor: 7_500 }] });
  assert.equal(full.status, "refunded");
  assert.equal(deriveEntitlementAfterFinancialReversal({ order: {}, financialState: full }).action, "suspend");

  const store = createEmbeddedStore();
  const order = await store.createCommercialOrder({ organizationId: "org-refund", planId: "starter-2", totalPrice: 100, paymentProvider: "mercado_pago" });
  await store.updateCommercialOrder(order.id, { paymentStatus: "paid", providerPaymentId: "pay-refund", refundReservedMinor: 0 });
  const common = { organizationId: "org-refund", orderId: order.id, providerPaymentId: "pay-refund", amountMinor: 6_000, currency: "MXN", type: "partial_refund", idempotencyKeyHash: hashRefundKey("refund-valid-key-0001"), requestFingerprint: buildRefundFingerprint({ organizationId: "org-refund", orderId: order.id, amountMinor: 6_000 }), requestedBy: "user-1", workerId: "worker-1" };
  const first = store.claimRefundOperation(common);
  assert.equal(first.claimed, true);
  assert.ok(store.reserveRefundAmount({ orderId: order.id, organizationId: "org-refund", amountMinor: 6_000, paidAmountMinor: 10_000 }));
  assert.equal(store.reserveRefundAmount({ orderId: order.id, organizationId: "org-refund", amountMinor: 5_000, paidAmountMinor: 10_000 }), null);
  store.completeRefundOperation({ operationId: first.operation.id, workerId: "worker-1", providerRefundId: "refund-1", safeResponse: { id: "refund-1" } });
  const replay = store.claimRefundOperation({ ...common, workerId: "worker-2" });
  assert.equal(replay.reason, "ready");
  const conflict = store.claimRefundOperation({ ...common, amountMinor: 5_000, requestFingerprint: buildRefundFingerprint({ organizationId: "org-refund", orderId: order.id, amountMinor: 5_000 }), workerId: "worker-3" });
  assert.equal(conflict.reason, "key_reused");
  console.log("refund policy and idempotency tests passed");
}

main().catch((error) => { console.error(error); process.exit(1); });
