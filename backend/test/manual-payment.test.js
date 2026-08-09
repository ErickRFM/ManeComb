const assert = require("node:assert/strict");
const {
  getCommercialPlanById,
  getCommercialPlanPricing
} = require("../src/config/commercial-plans");
const {
  claimManualPaymentDecision,
  completeManualPaymentDecision,
  getManualPaymentEvidence,
  getManualPaymentEligibility,
  resetManualPaymentEvidenceForTests,
  submitManualPaymentEvidence
} = require("../src/modules/manual-payments/service");

function order(overrides = {}) {
  return {
    id: "order-manual-01",
    referenceCode: "MNCB-MANUAL01",
    organizationId: "org-manual-01",
    paymentMethod: "spei",
    paymentProvider: "manual_bank_transfer",
    paymentStatus: "pending_manual_confirmation",
    activationStatus: "pending_payment",
    totalPrice: 159,
    currency: "MXN",
    ...overrides
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function main() {
  const starterPlan = getCommercialPlanById("starter-2");
  assert.ok(starterPlan, "starter-2 debe existir en el catálogo canónico");

  const starterWithoutRadio = getCommercialPlanPricing(starterPlan, []);
  assert.equal(starterWithoutRadio.basePlanPrice, 149);
  assert.equal(starterWithoutRadio.addOnsTotal, 0);
  assert.equal(starterWithoutRadio.totalPrice, 149);
  assert.equal(starterWithoutRadio.radioFeatureEnabled, false);

  const starterWithRadio = getCommercialPlanPricing(starterPlan, ["radio_dispatch"]);
  assert.equal(starterWithRadio.basePlanPrice, 149);
  assert.equal(starterWithRadio.addOnsTotal, 20);
  assert.equal(starterWithRadio.totalPrice, 169);
  assert.equal(starterWithRadio.radioFeatureEnabled, true);

  resetManualPaymentEvidenceForTests();
  const now = new Date("2026-08-07T17:00:00.000Z");
  const currentOrder = order();

  const eligibility = getManualPaymentEligibility(currentOrder);
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.expectedAmountMinor, 15900);

  await expectCode(
    submitManualPaymentEvidence({
      order: currentOrder,
      userId: "user-owner-01",
      idempotencyKey: "manual-submit-amount-mismatch-0001",
      now,
      payload: {
        trackingKey: "SPEI-TRACK-001",
        transferDate: "2026-08-07",
        amount: 158
      }
    }),
    "manual_payment_amount_mismatch"
  );

  const submitted = await submitManualPaymentEvidence({
    order: currentOrder,
    userId: "user-owner-01",
    idempotencyKey: "manual-submit-order-01-version-0001",
    now,
    payload: {
      trackingKey: "SPEI-TRACK-001",
      originBank: "Banco prueba",
      transferDate: "2026-08-07",
      amount: 159,
      note: "Transferencia realizada desde la cuenta empresarial"
    }
  });
  assert.equal(submitted.replayed, false);
  assert.equal(submitted.evidence.status, "pending_review");
  assert.equal(submitted.evidence.amountMinor, 15900);
  assert.equal(submitted.evidence.trackingKey, "SPEI-TRACK-001");
  assert.equal(submitted.evidence.version, 1);

  const replayedSubmission = await submitManualPaymentEvidence({
    order: currentOrder,
    userId: "user-owner-01",
    idempotencyKey: "manual-submit-order-01-version-0001",
    now,
    payload: {
      trackingKey: "SPEI-TRACK-001",
      originBank: "Banco prueba",
      transferDate: "2026-08-07",
      amount: 159,
      note: "Transferencia realizada desde la cuenta empresarial"
    }
  });
  assert.equal(replayedSubmission.replayed, true);
  assert.equal(replayedSubmission.evidence.id, submitted.evidence.id);

  await expectCode(
    submitManualPaymentEvidence({
      order: currentOrder,
      userId: "user-owner-01",
      idempotencyKey: "manual-submit-order-01-other-key-0002",
      now,
      payload: {
        trackingKey: "SPEI-TRACK-001",
        originBank: "Banco prueba",
        transferDate: "2026-08-07",
        amount: 159
      }
    }),
    "manual_payment_evidence_already_pending"
  );

  const rejectClaim = await claimManualPaymentDecision({
    orderId: currentOrder.id,
    decision: "reject",
    reviewNote: "No se localiza el depósito",
    reviewerId: "platform-finance-01",
    idempotencyKey: "manual-review-order-01-reject-0001",
    expectedEvidenceVersion: 1,
    now
  });
  assert.equal(rejectClaim.claimed, true);
  assert.equal(rejectClaim.evidence.status, "reviewing");

  const rejected = await completeManualPaymentDecision({
    orderId: currentOrder.id,
    decision: "reject",
    keyHash: rejectClaim.keyHash,
    reviewerId: "platform-finance-01",
    reviewNote: "No se localiza el depósito",
    now
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reviewedBy, "platform-finance-01");

  const resubmitted = await submitManualPaymentEvidence({
    order: currentOrder,
    userId: "user-owner-01",
    idempotencyKey: "manual-submit-order-01-version-0002",
    now: new Date("2026-08-07T17:10:00.000Z"),
    payload: {
      trackingKey: "SPEI-TRACK-002",
      originBank: "Banco prueba",
      transferDate: "2026-08-07",
      amount: 159,
      note: "Clave corregida"
    }
  });
  assert.equal(resubmitted.replayed, false);
  assert.equal(resubmitted.evidence.status, "pending_review");
  assert.equal(resubmitted.evidence.version, 2);
  assert.equal(resubmitted.evidence.trackingKey, "SPEI-TRACK-002");

  await expectCode(
    claimManualPaymentDecision({
      orderId: currentOrder.id,
      decision: "reject",
      reviewNote: "No se localiza el depósito",
      reviewerId: "platform-finance-01",
      idempotencyKey: "manual-review-order-01-reject-0001",
      expectedEvidenceVersion: 1,
      now: new Date("2026-08-07T17:11:00.000Z")
    }),
    "manual_payment_evidence_version_mismatch"
  );

  const approveClaim = await claimManualPaymentDecision({
    orderId: currentOrder.id,
    decision: "approve",
    reviewNote: "Depósito conciliado",
    reviewerId: "platform-finance-01",
    idempotencyKey: "manual-review-order-01-approve-0002",
    expectedEvidenceVersion: 2,
    now: new Date("2026-08-07T17:15:00.000Z")
  });
  assert.equal(approveClaim.claimed, true);

  const approved = await completeManualPaymentDecision({
    orderId: currentOrder.id,
    decision: "approve",
    keyHash: approveClaim.keyHash,
    reviewerId: "platform-finance-01",
    reviewNote: "Depósito conciliado",
    now: new Date("2026-08-07T17:15:00.000Z")
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.reviewNote, "Depósito conciliado");

  const replayedDecision = await claimManualPaymentDecision({
    orderId: currentOrder.id,
    decision: "approve",
    reviewNote: "Depósito conciliado",
    reviewerId: "platform-finance-01",
    idempotencyKey: "manual-review-order-01-approve-0002",
    expectedEvidenceVersion: 2,
    now: new Date("2026-08-07T17:16:00.000Z")
  });
  assert.equal(replayedDecision.claimed, false);
  assert.equal(replayedDecision.replayed, true);
  assert.equal(replayedDecision.evidence.status, "approved");

  const stored = await getManualPaymentEvidence(currentOrder.id);
  assert.equal(stored.status, "approved");
  assert.equal(stored.version, 2);

  const paidEligibility = getManualPaymentEligibility(order({ paymentStatus: "paid", activationStatus: "active" }));
  assert.equal(paidEligibility.eligible, false);
  assert.equal(paidEligibility.reason, "already_paid");

  console.log("manual-payment.test.js: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
