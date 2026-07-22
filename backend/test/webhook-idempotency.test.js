const assert = require("node:assert/strict");
const { WebhookEventModel } = require("../src/data/models");

function query(value) {
  return { lean: async () => (value ? { ...value } : null) };
}

async function run() {
  const originals = {
    findById: WebhookEventModel.findById,
    findByIdAndUpdate: WebhookEventModel.findByIdAndUpdate,
    findOne: WebhookEventModel.findOne,
    findOneAndUpdate: WebhookEventModel.findOneAndUpdate
  };
  const documents = new Map();

  WebhookEventModel.findOne = ({ provider, providerEventId }) =>
    query([...documents.values()].find((entry) => entry.provider === provider && entry.providerEventId === providerEventId));
  WebhookEventModel.findById = (id) => query(documents.get(id));
  WebhookEventModel.findByIdAndUpdate = (id, update) => {
    const current = documents.get(id);
    if (!current) return query(null);
    Object.assign(current, update.$set || {});
    return query(current);
  };
  WebhookEventModel.findOneAndUpdate = (filter, update) => {
    let current = [...documents.values()].find(
      (entry) => entry.provider === filter.provider && entry.providerEventId === filter.providerEventId
    );
    const now = new Date();
    const claimable =
      !current ||
      current.status === "received" ||
      (current.status === "failed_retryable" && new Date(current.nextRetryAt || 0) <= now) ||
      (current.status === "processing" && new Date(current.leaseUntil || 0) <= now);
    if (current && !claimable) {
      const error = new Error("duplicate");
      error.code = 11000;
      return { lean: async () => { throw error; } };
    }
    if (!current) {
      current = { ...(update.$setOnInsert || {}), status: "received", attemptCount: 0, retries: 0 };
      documents.set(current._id, current);
    }
    Object.assign(current, update.$set || {});
    current.attemptCount += update.$inc?.attemptCount || 0;
    current.retries += update.$inc?.retries || 0;
    return query(current);
  };

  delete require.cache[require.resolve("../src/services/webhook-idempotency")];
  const service = require("../src/services/webhook-idempotency");
  try {
    const deliveryKey = service.buildWebhookDeliveryKey({
      provider: "mercado_pago",
      requestId: "request-1",
      paymentId: "payment-1",
      notificationType: "payment",
      signatureTimestamp: "1720000000000"
    });
    assert.equal(deliveryKey.length, 64);

    const first = await service.claimWebhookDelivery({ provider: "mercado_pago", deliveryKey, paymentId: "payment-1" });
    assert.equal(first.claimed, true);
    assert.equal(first.reason, "new");
    assert.equal(first.event.attemptCount, 1);

    const activeLease = await service.claimWebhookDelivery({ provider: "mercado_pago", deliveryKey, paymentId: "payment-1" });
    assert.equal(activeLease.claimed, false);
    assert.equal(activeLease.reason, "currently_processing");

    documents.get(first.event._id).leaseUntil = new Date(Date.now() - 1);
    const recovered = await service.claimWebhookDelivery({ provider: "mercado_pago", deliveryKey, paymentId: "payment-1" });
    assert.equal(recovered.claimed, true);
    assert.equal(recovered.reason, "retry");
    assert.equal(recovered.event.attemptCount, 2);

    await service.failWebhookDelivery(recovered.event._id, { code: "temporary" });
    const failed = documents.get(recovered.event._id);
    assert.equal(failed.status, "failed_retryable");
    failed.nextRetryAt = new Date(Date.now() - 1);
    const retry = await service.claimWebhookDelivery({ provider: "mercado_pago", deliveryKey, paymentId: "payment-1" });
    assert.equal(retry.claimed, true);
    assert.equal(retry.event.attemptCount, 3);

    await service.completeWebhookDelivery(retry.event._id);
    const processed = await service.claimWebhookDelivery({ provider: "mercado_pago", deliveryKey, paymentId: "payment-1" });
    assert.equal(processed.claimed, false);
    assert.equal(processed.reason, "already_processed");

    const permanentKey = service.buildWebhookDeliveryKey({ provider: "mercado_pago", requestId: "request-2", paymentId: "payment-1" });
    const permanent = await service.claimWebhookDelivery({ provider: "mercado_pago", deliveryKey: permanentKey, paymentId: "payment-1" });
    await service.failWebhookDelivery(permanent.event._id, { code: "amount_mismatch", permanent: true });
    const blocked = await service.claimWebhookDelivery({ provider: "mercado_pago", deliveryKey: permanentKey, paymentId: "payment-1" });
    assert.equal(blocked.claimed, false);
    assert.equal(blocked.reason, "permanent_failure");
  } finally {
    Object.assign(WebhookEventModel, originals);
  }

  console.log("webhook idempotency lease tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
