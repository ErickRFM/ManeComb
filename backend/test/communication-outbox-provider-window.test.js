const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const history = require("../../communication-service/src/history");
const queue = require("../../communication-service/src/queue");
const engine = require("../../communication-service/src/delivery/engine");

const HOUR_MS = 60 * 60 * 1000;

async function main() {
  const mongod = await MongoMemoryServer.create();
  const originalGetReadiness = queue.getReadiness;
  const originalGetQueue = queue.getQueue;

  try {
    await mongoose.connect(mongod.getUri(), { dbName: "manecomb-outbox-provider-window" });
    history.configurePersistence({ mongoose });

    const input = {
      tenantScope: "organization:provider-window",
      organizationId: "provider-window",
      eventType: "PASSWORD_RESET",
      idempotencyKey: "provider-window:1",
      recipient: { email: "provider-window@example.com" },
      template: "password-reset",
      provider: "resend",
      priority: 5,
      data: { name: "Window", resetUrl: "https://example.com/reset/window" },
      status: "created",
      requireDurable: false
    };

    const claimed = await history.claim(input);
    await mongoose.connection.db.collection("communication_history").createIndex(
      { tenantScope: 1, eventType: 1, idempotencyKey: 1 },
      { unique: true, name: "email_delivery_idempotency" }
    );
    await history.refreshReadiness();

    const deliveryId = claimed.delivery.deliveryId;
    const baseNow = new Date("2026-08-30T03:00:00.000Z");
    const firstProviderBoundary = new Date(baseNow.getTime() - 5 * 60 * 1000);
    await history.updateDelivery(deliveryId, {
      status: "failed",
      attempts: 1,
      errorCategory: "network",
      errorMessage: "provider response lost"
    });
    await mongoose.connection.db.collection("communication_history").updateOne(
      { deliveryId },
      {
        $set: {
          createdAt: firstProviderBoundary,
          updatedAt: firstProviderBoundary,
          processingAt: firstProviderBoundary,
          failedAt: firstProviderBoundary
        }
      }
    );

    const queuedJobs = [];
    queue.getReadiness = () => ({ enabled: true, functional: true });
    queue.getQueue = () => ({
      async add(name, data, options) {
        queuedJobs.push({ name, data, options });
        return { id: options.jobId };
      }
    });

    const withinWindow = await engine.reconcileOutbox({
      now: baseNow,
      staleMs: 1000,
      leaseMs: 60000,
      providerReplayWindowMs: 23 * HOUR_MS,
      limit: 5
    });
    assert.equal(withinWindow.recovered, 1);
    assert.equal(withinWindow.quarantined, 0);
    assert.equal(queuedJobs.length, 1);

    const requeued = await history.getByDeliveryId(deliveryId);
    assert.equal(requeued.status, "queued");
    assert.equal(requeued.attempts, 1, "requeue no debe borrar que el provider ya fue intentado");

    const jobsBeforeExpiry = queuedJobs.length;
    const afterProviderWindow = new Date(baseNow.getTime() + 24 * HOUR_MS);
    const expired = await engine.reconcileOutbox({
      now: afterProviderWindow,
      staleMs: 1000,
      leaseMs: 60000,
      providerReplayWindowMs: 23 * HOUR_MS,
      limit: 5
    });

    assert.equal(expired.recovered, 0);
    assert.equal(expired.quarantined, 1);
    assert.equal(queuedJobs.length, jobsBeforeExpiry, "un delivery provider-crossed vencido no debe volver a encolarse");

    const quarantined = await history.getByDeliveryId(deliveryId);
    assert.equal(quarantined.status, "provider_result_unknown");
    assert.equal(await history.getOutboxByDeliveryId(deliveryId), null);

    console.log("ok - provider-crossed requeue conserva la ventana de certeza y se cuarentena al vencer");
  } finally {
    queue.getReadiness = originalGetReadiness;
    queue.getQueue = originalGetQueue;
    await mongoose.disconnect().catch(() => {});
    await mongod.stop().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
