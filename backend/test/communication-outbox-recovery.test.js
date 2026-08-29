const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const history = require("../../communication-service/src/history");
const queue = require("../../communication-service/src/queue");
const engine = require("../../communication-service/src/delivery/engine");

const INDEX_NAME = "email_delivery_idempotency";

function buildInput(suffix = "1") {
  return {
    tenantScope: "organization:outbox-test",
    organizationId: "outbox-test",
    eventType: "PASSWORD_RESET",
    idempotencyKey: `password-reset:outbox-${suffix}`,
    recipient: { email: `recipient-${suffix}@example.com` },
    template: "password-reset",
    provider: "resend",
    priority: 5,
    data: {
      name: "Outbox",
      resetUrl: `https://example.com/reset/${suffix}`
    },
    status: "created",
    requireDurable: false
  };
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  const originalGetReadiness = queue.getReadiness;
  const originalGetQueue = queue.getQueue;

  try {
    await mongoose.connect(mongod.getUri(), { dbName: "manecomb-outbox-test" });
    history.configurePersistence({ mongoose });

    // First claim initializes the schema/model. Production provisions the same
    // canonical idempotency index; the test creates it explicitly because the
    // model intentionally has autoIndex disabled.
    const firstClaim = await history.claim(buildInput("lost-job"));
    await mongoose.connection.db.collection("communication_history").createIndex(
      { tenantScope: 1, eventType: 1, idempotencyKey: 1 },
      { unique: true, name: INDEX_NAME }
    );
    await history.refreshReadiness();
    assert.equal(history.getReadiness().durable, true);

    const deliveryId = firstClaim.delivery.deliveryId;
    const internalBefore = await history.getOutboxByDeliveryId(deliveryId);
    assert.equal(internalBefore.outboxPayload.recipient.email, "recipient-lost-job@example.com");

    const publicBefore = await history.query({ eventType: "PASSWORD_RESET" });
    assert.equal(
      JSON.stringify(publicBefore).includes("recipient-lost-job@example.com"),
      false,
      "El historial público no debe exponer el payload ejecutable ni PII cruda"
    );

    const queuedJobs = [];
    queue.getReadiness = () => ({ enabled: true, functional: true });
    queue.getQueue = () => ({
      async add(name, data, options) {
        queuedJobs.push({ name, data, options });
        return { id: options.jobId };
      }
    });

    // Simula pérdida total de Redis: no existe job alguno. El único estado
    // sobreviviente es el outbox Mongo. Avanzamos el reloj para que sea stale.
    const recovery = await engine.reconcileOutbox({
      now: new Date(Date.now() + 5 * 60 * 1000),
      staleMs: 1000,
      leaseMs: 60000,
      limit: 5
    });

    assert.deepEqual(recovery, { scanned: 1, recovered: 1, failed: 0, skipped: false });
    assert.equal(queuedJobs.length, 1);
    assert.equal(queuedJobs[0].name, "send-email");
    assert.equal(queuedJobs[0].data.deliveryId, deliveryId);
    assert.equal(queuedJobs[0].data.recipient.email, "recipient-lost-job@example.com");
    assert.match(queuedJobs[0].options.jobId, /^email-organization_outbox-test-PASSWORD_RESET-/);

    const queuedDelivery = await history.getByDeliveryId(deliveryId);
    assert.equal(queuedDelivery.status, "queued");
    assert.equal(queuedDelivery.recoveryCount, 1);

    // A second reaper cannot lease the same freshly repaired record immediately.
    const duplicateLease = await history.claimRecoverableDelivery({
      now: new Date(),
      staleMs: 1000,
      leaseMs: 60000
    });
    assert.equal(duplicateLease, null);

    await history.updateDelivery(deliveryId, {
      status: "sent",
      providerMessageId: "resend-message-1"
    });
    assert.equal(await history.getOutboxByDeliveryId(deliveryId), null);
    const rawSent = await mongoose.connection.db.collection("communication_history").findOne({ deliveryId });
    assert.equal(Object.prototype.hasOwnProperty.call(rawSent, "outboxPayload"), false);
    assert.ok(rawSent.finalizedAt instanceof Date);

    // Provider failure is recoverable while retries remain, so its payload must
    // survive `status: failed`; explicit finalization is what removes it.
    const failedClaim = await history.claim(buildInput("retryable-failure"));
    await history.updateDelivery(failedClaim.delivery.deliveryId, {
      status: "failed",
      errorCategory: "network",
      errorMessage: "timeout"
    });
    assert.ok(await history.getOutboxByDeliveryId(failedClaim.delivery.deliveryId));
    await history.finalizeDelivery(failedClaim.delivery.deliveryId, {
      status: "failed",
      errorCategory: "network"
    });
    assert.equal(await history.getOutboxByDeliveryId(failedClaim.delivery.deliveryId), null);

    console.log("ok - Mongo outbox reconstruye BullMQ tras pérdida total de Redis y minimiza PII pendiente");
  } finally {
    queue.getReadiness = originalGetReadiness;
    queue.getQueue = originalGetQueue;
    history.configurePersistence({});
    await mongoose.disconnect().catch(() => null);
    await mongod.stop().catch(() => null);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
