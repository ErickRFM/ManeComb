const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const history = require("../../communication-service/src/history");
const queue = require("../../communication-service/src/queue");
const engine = require("../../communication-service/src/delivery/engine");

const INDEX_NAME = "email_delivery_idempotency";
const HOUR_MS = 60 * 60 * 1000;

function buildInput(suffix = "1", provider = "resend") {
  return {
    tenantScope: "organization:outbox-test",
    organizationId: "outbox-test",
    eventType: "PASSWORD_RESET",
    idempotencyKey: `password-reset:outbox-${suffix}`,
    recipient: { email: `recipient-${suffix}@example.com` },
    template: "password-reset",
    provider,
    priority: 5,
    data: {
      name: "Outbox",
      resetUrl: `https://example.com/reset/${suffix}`
    },
    status: "created",
    requireDurable: false
  };
}

async function setDeliveryClock(deliveryId, date) {
  await mongoose.connection.db.collection("communication_history").updateOne(
    { deliveryId },
    { $set: { updatedAt: date, processingAt: date } }
  );
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

    assert.deepEqual(recovery, {
      scanned: 1,
      recovered: 1,
      failed: 0,
      quarantined: 0,
      skipped: false
    });
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

    // If the process died after crossing the provider boundary, Resend replay is
    // safe only while its documented idempotency retention is still alive. We
    // use a 23h ManeComb window for margin inside Resend's 24h contract.
    const clock = new Date("2026-08-30T03:00:00.000Z");
    const recentProcessing = await history.claim(buildInput("recent-processing"));
    await history.updateDelivery(recentProcessing.delivery.deliveryId, {
      status: "processing",
      attempts: 1
    });
    await setDeliveryClock(
      recentProcessing.delivery.deliveryId,
      new Date(clock.getTime() - 5 * 60 * 1000)
    );
    const jobsBeforeRecentRecovery = queuedJobs.length;
    const recentRecovery = await engine.reconcileOutbox({
      now: clock,
      staleMs: 1000,
      leaseMs: 60000,
      providerReplayWindowMs: 23 * HOUR_MS,
      limit: 5
    });
    assert.deepEqual(recentRecovery, {
      scanned: 1,
      recovered: 1,
      failed: 0,
      quarantined: 0,
      skipped: false
    });
    assert.equal(queuedJobs.length, jobsBeforeRecentRecovery + 1);
    assert.equal(
      queuedJobs.at(-1).data.deliveryId,
      recentProcessing.delivery.deliveryId,
      "El replay reciente debe conservar exactamente el deliveryId usado como Idempotency-Key"
    );
    await history.finalizeDelivery(recentProcessing.delivery.deliveryId, { status: "failed" });

    // Once that provider-certainty window has expired, automatic retry is more
    // dangerous than a visible unknown result. Quarantine removes executable
    // payload and queues nothing, preserving one-provider-attempt semantics.
    const expiredProcessing = await history.claim(buildInput("expired-processing"));
    await history.updateDelivery(expiredProcessing.delivery.deliveryId, {
      status: "processing",
      attempts: 1
    });
    await setDeliveryClock(
      expiredProcessing.delivery.deliveryId,
      new Date(clock.getTime() - 24 * HOUR_MS)
    );
    const jobsBeforeExpiredRecovery = queuedJobs.length;
    const expiredRecovery = await engine.reconcileOutbox({
      now: clock,
      staleMs: 1000,
      leaseMs: 60000,
      providerReplayWindowMs: 23 * HOUR_MS,
      limit: 5
    });
    assert.deepEqual(expiredRecovery, {
      scanned: 0,
      recovered: 0,
      failed: 0,
      quarantined: 1,
      skipped: false
    });
    assert.equal(queuedJobs.length, jobsBeforeExpiredRecovery);
    const expiredResult = await history.getByDeliveryId(expiredProcessing.delivery.deliveryId);
    assert.equal(expiredResult.status, "provider_result_unknown");
    assert.ok(expiredResult.finalizedAt instanceof Date);
    assert.equal(await history.getOutboxByDeliveryId(expiredProcessing.delivery.deliveryId), null);

    // Providers without a known retry-idempotency contract never get a blind
    // stale `processing` replay. They are quarantined as soon as stale.
    const unknownProvider = await history.claim(buildInput("generic-processing", "generic"));
    await history.updateDelivery(unknownProvider.delivery.deliveryId, {
      status: "processing",
      attempts: 1
    });
    await setDeliveryClock(
      unknownProvider.delivery.deliveryId,
      new Date(clock.getTime() - 5 * 60 * 1000)
    );
    const jobsBeforeGeneric = queuedJobs.length;
    const genericRecovery = await engine.reconcileOutbox({
      now: clock,
      staleMs: 1000,
      leaseMs: 60000,
      providerReplayWindowMs: 23 * HOUR_MS,
      limit: 5
    });
    assert.deepEqual(genericRecovery, {
      scanned: 0,
      recovered: 0,
      failed: 0,
      quarantined: 1,
      skipped: false
    });
    assert.equal(queuedJobs.length, jobsBeforeGeneric);
    assert.equal(
      (await history.getByDeliveryId(unknownProvider.delivery.deliveryId)).status,
      "provider_result_unknown"
    );

    console.log("ok - Mongo outbox recupera Redis sin duplicar y acota ambiguedad del provider");
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
