const crypto = require("crypto");
const { randomUUID } = require("crypto");
const { WebhookEventModel } = require("../data/models");

function hashPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex");
}

async function registerWebhookEvent({ provider, providerEventId, payload, metadata = null }) {
  const safeProvider = String(provider || "").trim();
  const safeProviderEventId = String(providerEventId || "").trim();

  if (!safeProvider || !safeProviderEventId) {
    return {
      duplicate: false,
      event: null
    };
  }

  const payloadHash = hashPayload(payload);
  const existing = await WebhookEventModel.findOne({
    provider: safeProvider,
    providerEventId: safeProviderEventId
  }).lean();

  if (existing) {
    return {
      duplicate: true,
      event: existing
    };
  }

  const event = await WebhookEventModel.create({
    _id: randomUUID(),
    provider: safeProvider,
    providerEventId: safeProviderEventId,
    payloadHash,
    receivedAt: new Date(),
    processedAt: null,
    status: "received",
    retries: 0,
    metadata
  });

  return {
    duplicate: false,
    event
  };
}

async function markWebhookProcessed(eventId, status = "processed") {
  if (!eventId) {
    return null;
  }

  return await WebhookEventModel.findByIdAndUpdate(
    eventId,
    {
      $set: {
        status,
        processedAt: new Date()
      }
    },
    { returnDocument: "after" }
  ).lean();
}

module.exports = {
  hashPayload,
  markWebhookProcessed,
  registerWebhookEvent
};
