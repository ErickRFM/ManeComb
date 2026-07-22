const crypto = require("node:crypto");
const { randomUUID } = require("node:crypto");
const { WebhookEventModel } = require("../data/models");

const WEBHOOK_LEASE_MS = 60_000;
const WEBHOOK_MAX_ATTEMPTS = 5;
const WEBHOOK_RETRY_BASE_MS = 30_000;

function hashPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}

function buildWebhookDeliveryKey({ provider, requestId, paymentId, notificationType, signatureTimestamp }) {
  const identity = [provider, requestId, paymentId, notificationType, signatureTimestamp]
    .map((value) => String(value || "").trim().slice(0, 160))
    .join("|");
  return crypto.createHash("sha256").update(identity).digest("hex");
}

function claimReason(event, now) {
  if (!event) return "unavailable";
  if (event.status === "processed") return "already_processed";
  if (event.status === "failed_permanent") return "permanent_failure";
  if (event.status === "processing" && new Date(event.leaseUntil || 0) > now) return "currently_processing";
  if (event.status === "failed_retryable" && new Date(event.nextRetryAt || 0) > now) return "retry_scheduled";
  return "retryable";
}

async function claimWebhookDelivery({
  provider,
  deliveryKey,
  paymentId,
  observedStatus = null,
  requestId = null,
  signatureTimestamp = null,
  workerId = randomUUID(),
  leaseDurationMs = WEBHOOK_LEASE_MS,
  payloadHash = null,
  now = new Date()
}) {
  const leaseUntil = new Date(now.getTime() + leaseDurationMs);
  const query = {
    provider,
    providerEventId: deliveryKey,
    $or: [
      { status: { $exists: false } },
      { status: "received" },
      { status: "failed_retryable", nextRetryAt: { $lte: now } },
      { status: "processing", leaseUntil: { $lte: now } }
    ]
  };

  try {
    const event = await WebhookEventModel.findOneAndUpdate(
      query,
      {
        $setOnInsert: {
          _id: randomUUID(),
          provider,
          providerEventId: deliveryKey,
          deliveryKey,
          paymentId,
          requestId,
          signatureTimestamp,
          payloadHash: payloadHash || hashPayload({ provider, deliveryKey, paymentId }),
          receivedAt: now
        },
        $set: {
          status: "processing",
          observedStatus,
          leaseOwner: workerId,
          leaseUntil,
          processingStartedAt: now,
          lastErrorCode: null
        },
        $inc: { attemptCount: 1, retries: 1 }
      },
      { upsert: true, returnDocument: "after" }
    ).lean();
    const recovered = Number(event.attemptCount || 0) > 1;
    return { claimed: true, reason: recovered ? "retry" : "new", event };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const event = await WebhookEventModel.findOne({ provider, providerEventId: deliveryKey }).lean();
    return { claimed: false, reason: claimReason(event, now), event };
  }
}

async function completeWebhookDelivery(eventId, { orderId = null, observedStatus = null } = {}) {
  return WebhookEventModel.findByIdAndUpdate(
    eventId,
    {
      $set: {
        status: "processed",
        processedAt: new Date(),
        orderId,
        observedStatus,
        leaseOwner: null,
        leaseUntil: null,
        nextRetryAt: null
      }
    },
    { returnDocument: "after" }
  ).lean();
}

async function failWebhookDelivery(eventId, { code = "processing_failed", permanent = false } = {}) {
  const event = await WebhookEventModel.findById(eventId).lean();
  if (!event) return null;
  const attempts = Number(event.attemptCount || 0);
  const finalFailure = permanent || attempts >= WEBHOOK_MAX_ATTEMPTS;
  const nextRetryAt = finalFailure
    ? null
    : new Date(Date.now() + WEBHOOK_RETRY_BASE_MS * Math.max(1, attempts));
  return WebhookEventModel.findByIdAndUpdate(
    eventId,
    {
      $set: {
        status: finalFailure ? "failed_permanent" : "failed_retryable",
        failedAt: new Date(),
        lastErrorCode: String(code || "processing_failed").slice(0, 120),
        leaseOwner: null,
        leaseUntil: null,
        nextRetryAt
      }
    },
    { returnDocument: "after" }
  ).lean();
}

// Compatibility wrappers for non-Mercado Pago consumers.
async function registerWebhookEvent({ provider, providerEventId, payload }) {
  return claimWebhookDelivery({
    provider,
    deliveryKey: providerEventId,
    paymentId: providerEventId,
    payloadHash: hashPayload(payload)
  }).then(({ claimed, event }) => ({ duplicate: !claimed, event }));
}

const markWebhookProcessed = (eventId) => completeWebhookDelivery(eventId);

module.exports = {
  WEBHOOK_LEASE_MS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_BASE_MS,
  buildWebhookDeliveryKey,
  claimWebhookDelivery,
  completeWebhookDelivery,
  failWebhookDelivery,
  hashPayload,
  markWebhookProcessed,
  registerWebhookEvent
};
