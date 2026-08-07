const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { toMinorUnits } = require("../../services/commercial-payment");

const REVIEW_LEASE_MS = 60 * 1000;
const MAX_TRANSFER_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 15 * 60 * 1000;
const memoryEvidence = new Map();

const manualPaymentEvidenceSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    orderId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    submittedBy: { type: String, required: true },
    trackingKey: { type: String, required: true },
    originBank: { type: String, default: "" },
    transferDate: { type: Date, required: true },
    amountMinor: { type: Number, required: true },
    currency: { type: String, default: "MXN" },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending_review", "reviewing", "approved", "rejected"],
      default: "pending_review",
      index: true
    },
    submissionKeyHash: { type: String, required: true },
    submissionFingerprint: { type: String, required: true },
    submittedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
    pendingDecision: { type: String, enum: ["approve", "reject", null], default: null },
    decisionKeyHash: { type: String, default: null },
    decisionFingerprint: { type: String, default: null },
    reviewLeaseUntil: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" }
  },
  {
    collection: "manual_payment_evidence",
    versionKey: false
  }
);
manualPaymentEvidenceSchema.index({ organizationId: 1, status: 1, submittedAt: -1 });

const ManualPaymentEvidenceModel =
  mongoose.models.ManualPaymentEvidence ||
  mongoose.model("ManualPaymentEvidence", manualPaymentEvidenceSchema);

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function domainError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (key.length < 16 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw domainError(
      "invalid_manual_payment_idempotency_key",
      "Idempotency-Key es obligatorio y debe ser un identificador opaco válido.",
      400
    );
  }
  return key;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeTrackingKey(value) {
  const trackingKey = sanitizeText(value, 80).replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{5,79}$/.test(trackingKey)) {
    throw domainError(
      "invalid_manual_payment_tracking_key",
      "La clave de rastreo SPEI debe tener entre 6 y 80 caracteres válidos.",
      400
    );
  }
  return trackingKey;
}

function normalizeTransferDate(value, now = new Date()) {
  const raw = String(value || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw domainError("invalid_manual_payment_transfer_date", "La fecha de transferencia no es válida.", 400);
  }
  const nowTime = now.getTime();
  if (date.getTime() > nowTime + MAX_FUTURE_SKEW_MS) {
    throw domainError("manual_payment_transfer_date_in_future", "La fecha de transferencia no puede estar en el futuro.", 400);
  }
  if (date.getTime() < nowTime - MAX_TRANSFER_AGE_MS) {
    throw domainError("manual_payment_transfer_date_too_old", "La transferencia es demasiado antigua para validarse desde este flujo.", 400);
  }
  return date;
}

function normalizeDecision(value) {
  const decision = String(value || "").trim().toLowerCase();
  if (!["approve", "reject"].includes(decision)) {
    throw domainError("invalid_manual_payment_decision", "La decisión debe ser approve o reject.", 400);
  }
  return decision;
}

function getEvidenceFingerprint(payload) {
  return hash(JSON.stringify({
    amountMinor: payload.amountMinor,
    currency: payload.currency,
    originBank: payload.originBank,
    trackingKey: payload.trackingKey,
    transferDate: payload.transferDate.toISOString(),
    note: payload.note
  }));
}

function getDecisionFingerprint(decision, reviewNote) {
  return hash(JSON.stringify({ decision, reviewNote }));
}

function isManualTransferOrder(order) {
  const provider = String(order?.paymentProvider || "").trim().toLowerCase();
  const method = String(order?.paymentMethod || "").trim().toLowerCase();
  if (["manual", "manual_bank_transfer", "bank_transfer"].includes(provider)) return true;
  return !provider && ["spei", "transfer"].includes(method);
}

function getManualPaymentEligibility(order) {
  if (!order) return { eligible: false, reason: "order_not_found" };
  if (!isManualTransferOrder(order)) return { eligible: false, reason: "not_manual_transfer" };
  const paymentStatus = String(order.paymentStatus || "").trim().toLowerCase();
  const activationStatus = String(order.activationStatus || "").trim().toLowerCase();
  if (["paid", "approved", "paid_test"].includes(paymentStatus) || activationStatus === "active") {
    return { eligible: false, reason: "already_paid" };
  }
  if (!["pending", "pending_payment", "pending_manual_confirmation"].includes(paymentStatus)) {
    return { eligible: false, reason: "manual_transfer_not_pending" };
  }
  const expectedAmountMinor = toMinorUnits(order.totalPrice, order.currency || "MXN");
  if (!Number.isInteger(expectedAmountMinor) || expectedAmountMinor <= 0) {
    return { eligible: false, reason: "invalid_order_amount" };
  }
  return {
    eligible: true,
    reason: "eligible",
    expectedAmountMinor,
    currency: String(order.currency || "MXN").trim().toUpperCase() || "MXN"
  };
}

function toPlain(record) {
  if (!record) return null;
  if (typeof record.toObject === "function") return record.toObject();
  return clone(record);
}

function serializeManualPaymentEvidence(record) {
  const value = toPlain(record);
  if (!value) return null;
  return {
    id: String(value._id || value.id || ""),
    orderId: String(value.orderId || ""),
    organizationId: String(value.organizationId || ""),
    submittedBy: String(value.submittedBy || ""),
    trackingKey: String(value.trackingKey || ""),
    originBank: String(value.originBank || ""),
    transferDate: value.transferDate ? new Date(value.transferDate).toISOString() : null,
    amountMinor: Number(value.amountMinor || 0),
    amount: Number(value.amountMinor || 0) / 100,
    currency: String(value.currency || "MXN"),
    note: String(value.note || ""),
    status: String(value.status || "pending_review"),
    submittedAt: value.submittedAt ? new Date(value.submittedAt).toISOString() : null,
    updatedAt: value.updatedAt ? new Date(value.updatedAt).toISOString() : null,
    version: Number(value.version || 1),
    pendingDecision: value.pendingDecision || null,
    reviewedBy: value.reviewedBy || null,
    reviewedAt: value.reviewedAt ? new Date(value.reviewedAt).toISOString() : null,
    reviewNote: String(value.reviewNote || "")
  };
}

async function findRawEvidence(orderId) {
  const key = String(orderId || "").trim();
  if (!key) return null;
  if (!isMongoReady()) return clone(memoryEvidence.get(key) || null);
  return ManualPaymentEvidenceModel.findOne({ orderId: key }).lean();
}

async function getManualPaymentEvidence(orderId) {
  return serializeManualPaymentEvidence(await findRawEvidence(orderId));
}

function buildSubmission({ order, userId, payload, idempotencyKey, now }) {
  const eligibility = getManualPaymentEligibility(order);
  if (!eligibility.eligible) {
    throw domainError(
      eligibility.reason,
      eligibility.reason === "already_paid"
        ? "Esta orden ya fue pagada y no acepta otra evidencia."
        : "La orden no está disponible para validar una transferencia manual.",
      eligibility.reason === "already_paid" ? 409 : 400
    );
  }

  const currency = eligibility.currency;
  const amountMinor = toMinorUnits(payload?.amount, currency);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw domainError("invalid_manual_payment_amount", "El importe de la transferencia no es válido.", 400);
  }
  if (amountMinor !== eligibility.expectedAmountMinor) {
    throw domainError(
      "manual_payment_amount_mismatch",
      "El importe de la transferencia debe coincidir exactamente con el importe de la orden.",
      409
    );
  }

  const submission = {
    orderId: String(order.id || "").trim(),
    organizationId: String(order.organizationId || "").trim(),
    submittedBy: String(userId || "").trim(),
    trackingKey: normalizeTrackingKey(payload?.trackingKey),
    originBank: sanitizeText(payload?.originBank, 80),
    transferDate: normalizeTransferDate(payload?.transferDate, now),
    amountMinor,
    currency,
    note: sanitizeText(payload?.note, 500),
    submissionKeyHash: hash(normalizeIdempotencyKey(idempotencyKey)),
    submittedAt: now,
    updatedAt: now
  };
  submission.submissionFingerprint = getEvidenceFingerprint(submission);
  return submission;
}

async function submitManualPaymentEvidence({ order, userId, payload = {}, idempotencyKey, now = new Date() }) {
  const submission = buildSubmission({ order, userId, payload, idempotencyKey, now });
  let existing = await findRawEvidence(submission.orderId);

  if (existing) {
    if (
      existing.submissionKeyHash === submission.submissionKeyHash &&
      existing.submissionFingerprint === submission.submissionFingerprint
    ) {
      return { evidence: serializeManualPaymentEvidence(existing), replayed: true };
    }
    if (["pending_review", "reviewing"].includes(String(existing.status))) {
      throw domainError(
        "manual_payment_evidence_already_pending",
        "Ya existe una evidencia de transferencia pendiente de revisión.",
        409
      );
    }
    if (String(existing.status) === "approved") {
      throw domainError("manual_payment_evidence_already_approved", "La transferencia ya fue aprobada.", 409);
    }
  }

  const next = {
    _id: existing?._id || crypto.randomUUID(),
    ...submission,
    status: "pending_review",
    version: Number(existing?.version || 0) + 1,
    pendingDecision: null,
    decisionKeyHash: null,
    decisionFingerprint: null,
    reviewLeaseUntil: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: ""
  };

  if (!isMongoReady()) {
    memoryEvidence.set(submission.orderId, clone(next));
    return { evidence: serializeManualPaymentEvidence(next), replayed: false };
  }

  try {
    const persisted = existing
      ? await ManualPaymentEvidenceModel.findOneAndUpdate(
          { orderId: submission.orderId, status: "rejected" },
          { $set: next },
          { new: true }
        ).lean()
      : await ManualPaymentEvidenceModel.create(next);

    if (!persisted) {
      throw domainError(
        "manual_payment_evidence_state_changed",
        "La evidencia cambió mientras se procesaba. Actualiza la página e intenta nuevamente.",
        409
      );
    }
    return { evidence: serializeManualPaymentEvidence(persisted), replayed: false };
  } catch (error) {
    if (error?.code === 11000) {
      existing = await findRawEvidence(submission.orderId);
      if (
        existing?.submissionKeyHash === submission.submissionKeyHash &&
        existing?.submissionFingerprint === submission.submissionFingerprint
      ) {
        return { evidence: serializeManualPaymentEvidence(existing), replayed: true };
      }
      throw domainError(
        "manual_payment_evidence_already_pending",
        "Ya existe una evidencia de transferencia para esta orden.",
        409
      );
    }
    throw error;
  }
}

async function claimManualPaymentDecision({ orderId, decision, reviewNote = "", reviewerId, idempotencyKey, now = new Date() }) {
  const normalizedDecision = normalizeDecision(decision);
  const normalizedNote = sanitizeText(reviewNote, 500);
  if (normalizedDecision === "reject" && normalizedNote.length < 4) {
    throw domainError("manual_payment_rejection_note_required", "Indica el motivo del rechazo.", 400);
  }
  const keyHash = hash(normalizeIdempotencyKey(idempotencyKey));
  const fingerprint = getDecisionFingerprint(normalizedDecision, normalizedNote);
  const current = await findRawEvidence(orderId);
  if (!current) {
    throw domainError("manual_payment_evidence_not_found", "No existe evidencia de transferencia para esta orden.", 404);
  }

  if (["approved", "rejected"].includes(String(current.status))) {
    if (current.decisionKeyHash === keyHash && current.decisionFingerprint === fingerprint) {
      return {
        claimed: false,
        replayed: true,
        decision: normalizedDecision,
        keyHash,
        evidence: serializeManualPaymentEvidence(current)
      };
    }
    throw domainError("manual_payment_already_reviewed", "Esta transferencia ya fue revisada.", 409);
  }

  const leaseUntil = new Date(now.getTime() + REVIEW_LEASE_MS);
  if (!isMongoReady()) {
    const memoryCurrent = memoryEvidence.get(String(orderId));
    if (!memoryCurrent) throw domainError("manual_payment_evidence_not_found", "No existe evidencia de transferencia para esta orden.", 404);
    const leaseActive = memoryCurrent.status === "reviewing" && new Date(memoryCurrent.reviewLeaseUntil || 0).getTime() > now.getTime();
    if (leaseActive) {
      throw domainError("manual_payment_review_in_progress", "La transferencia ya está siendo revisada.", 409);
    }
    const claimed = {
      ...memoryCurrent,
      status: "reviewing",
      pendingDecision: normalizedDecision,
      decisionKeyHash: keyHash,
      decisionFingerprint: fingerprint,
      reviewLeaseUntil: leaseUntil,
      reviewedBy: String(reviewerId || "").trim(),
      reviewNote: normalizedNote,
      updatedAt: now
    };
    memoryEvidence.set(String(orderId), clone(claimed));
    return {
      claimed: true,
      replayed: false,
      decision: normalizedDecision,
      keyHash,
      evidence: serializeManualPaymentEvidence(claimed)
    };
  }

  const claimed = await ManualPaymentEvidenceModel.findOneAndUpdate(
    {
      orderId: String(orderId),
      $or: [
        { status: "pending_review" },
        { status: "reviewing", reviewLeaseUntil: { $lte: now } }
      ]
    },
    {
      $set: {
        status: "reviewing",
        pendingDecision: normalizedDecision,
        decisionKeyHash: keyHash,
        decisionFingerprint: fingerprint,
        reviewLeaseUntil: leaseUntil,
        reviewedBy: String(reviewerId || "").trim(),
        reviewNote: normalizedNote,
        updatedAt: now
      }
    },
    { new: true }
  ).lean();

  if (!claimed) {
    const latest = await findRawEvidence(orderId);
    if (
      ["approved", "rejected"].includes(String(latest?.status)) &&
      latest?.decisionKeyHash === keyHash &&
      latest?.decisionFingerprint === fingerprint
    ) {
      return {
        claimed: false,
        replayed: true,
        decision: normalizedDecision,
        keyHash,
        evidence: serializeManualPaymentEvidence(latest)
      };
    }
    throw domainError("manual_payment_review_in_progress", "La transferencia ya está siendo revisada.", 409);
  }

  return {
    claimed: true,
    replayed: false,
    decision: normalizedDecision,
    keyHash,
    evidence: serializeManualPaymentEvidence(claimed)
  };
}

async function completeManualPaymentDecision({ orderId, decision, keyHash, reviewerId, reviewNote = "", now = new Date() }) {
  const finalStatus = normalizeDecision(decision) === "approve" ? "approved" : "rejected";
  const updates = {
    status: finalStatus,
    pendingDecision: null,
    reviewLeaseUntil: null,
    reviewedBy: String(reviewerId || "").trim(),
    reviewedAt: now,
    reviewNote: sanitizeText(reviewNote, 500),
    updatedAt: now
  };

  if (!isMongoReady()) {
    const current = memoryEvidence.get(String(orderId));
    if (!current || current.status !== "reviewing" || current.decisionKeyHash !== keyHash) {
      throw domainError("manual_payment_review_claim_lost", "La revisión perdió su bloqueo de seguridad.", 409);
    }
    const completed = { ...current, ...updates };
    memoryEvidence.set(String(orderId), clone(completed));
    return serializeManualPaymentEvidence(completed);
  }

  const completed = await ManualPaymentEvidenceModel.findOneAndUpdate(
    { orderId: String(orderId), status: "reviewing", decisionKeyHash: keyHash },
    { $set: updates },
    { new: true }
  ).lean();
  if (!completed) {
    throw domainError("manual_payment_review_claim_lost", "La revisión perdió su bloqueo de seguridad.", 409);
  }
  return serializeManualPaymentEvidence(completed);
}

async function releaseManualPaymentDecision({ orderId, keyHash, now = new Date() }) {
  const updates = {
    status: "pending_review",
    pendingDecision: null,
    decisionKeyHash: null,
    decisionFingerprint: null,
    reviewLeaseUntil: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: "",
    updatedAt: now
  };
  if (!isMongoReady()) {
    const current = memoryEvidence.get(String(orderId));
    if (current?.status === "reviewing" && current.decisionKeyHash === keyHash) {
      memoryEvidence.set(String(orderId), clone({ ...current, ...updates }));
    }
    return;
  }
  await ManualPaymentEvidenceModel.updateOne(
    { orderId: String(orderId), status: "reviewing", decisionKeyHash: keyHash },
    { $set: updates }
  );
}

function resetManualPaymentEvidenceForTests() {
  memoryEvidence.clear();
}

module.exports = {
  claimManualPaymentDecision,
  completeManualPaymentDecision,
  getManualPaymentEligibility,
  getManualPaymentEvidence,
  isManualTransferOrder,
  releaseManualPaymentDecision,
  resetManualPaymentEvidenceForTests,
  serializeManualPaymentEvidence,
  submitManualPaymentEvidence
};
