const crypto = require("crypto");
const { maskEmail, hashRecipient, sanitizeProviderError } = require("../security");

let mongoose = null;
let indexState = "unavailable";

let HistoryModel = null;
let memoryStore = [];

const SAFE_REQUEUE_STATUSES = ["created", "queued"];
const PROVIDER_RESULT_UNKNOWN_STATUS = "provider_result_unknown";
const AUTO_FINAL_STATUSES = new Set(["sent", "skipped", "dry_run", PROVIDER_RESULT_UNKNOWN_STATUS]);
const DEFAULT_PROVIDER_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;

function configurePersistence(options = {}) {
  mongoose = options.mongoose || null;
  HistoryModel = null;
  indexState = mongoose?.connection?.readyState === 1 ? "unknown" : "unavailable";
}

function createDeliveryId() {
  return `email-${crypto.randomUUID()}`;
}

function getModel() {
  if (!HistoryModel && mongoose && mongoose.connection?.readyState === 1) {
    const schema = new mongoose.Schema({
      _id: { type: String, required: true },
      deliveryId: { type: String, required: true, unique: true },
      tenantScope: { type: String, required: true },
      organizationId: { type: String, default: "", index: true },
      userId: { type: String, default: "", index: true },
      eventType: { type: String, required: true },
      idempotencyKey: { type: String, required: true },
      recipientMasked: { type: String, required: true },
      recipientHash: { type: String, required: true },
      template: { type: String, required: true, index: true },
      provider: { type: String, default: null },
      status: {
        type: String,
        enum: [
          "created",
          "queued",
          "processing",
          "sent",
          "failed",
          "skipped",
          "dry_run",
          PROVIDER_RESULT_UNKNOWN_STATUS
        ],
        required: true,
        index: true
      },
      priority: { type: Number, default: 1 },
      providerMessageId: { type: String, default: null },
      durationMs: { type: Number, default: null },
      attempts: { type: Number, default: 0 },
      errorCategory: { type: String, default: null },
      errorCode: { type: String, default: null },
      errorMessage: { type: String, default: null },
      queuedAt: { type: Date, default: null },
      processingAt: { type: Date, default: null },
      sentAt: { type: Date, default: null },
      failedAt: { type: Date, default: null },
      finalizedAt: { type: Date, default: null, index: true },
      recoveryClaimedAt: { type: Date, default: null },
      recoveryLeaseUntil: { type: Date, default: null, index: true },
      recoveryCount: { type: Number, default: 0 },
      // Executable payload is intentionally internal and temporary. Normal
      // history/admin queries never select it; terminal delivery removes it.
      outboxPayload: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
      createdAt: { type: Date, default: Date.now, index: true },
      updatedAt: { type: Date, default: Date.now }
    }, { collection: "communication_history", versionKey: false, strict: false, autoIndex: false });
    schema.index(
      { tenantScope: 1, eventType: 1, idempotencyKey: 1 },
      {
        unique: true,
        name: "email_delivery_idempotency",
        partialFilterExpression: {
          tenantScope: { $type: "string" },
          eventType: { $type: "string" },
          idempotencyKey: { $type: "string" }
        }
      }
    );
    schema.index({ status: 1, createdAt: -1 });
    schema.index({ finalizedAt: 1, status: 1, updatedAt: 1, recoveryLeaseUntil: 1 });
    HistoryModel = mongoose.models.CommunicationHistory || mongoose.model("CommunicationHistory", schema);
  }
  return HistoryModel;
}

async function refreshReadiness() {
  const Model = getModel();
  if (!Model) {
    indexState = "unavailable";
    return getReadiness();
  }
  try {
    indexState = await Model.collection.indexExists("email_delivery_idempotency") ? "ready" : "missing";
  } catch {
    indexState = "error";
  }
  return getReadiness();
}

function buildOutboxPayload(input) {
  const email = input.recipient?.email || input.to;
  return {
    recipient: { email },
    template: input.template,
    eventType: input.eventType,
    tenantScope: input.tenantScope,
    tenantId: input.tenantId || null,
    organizationId: input.organizationId || null,
    idempotencyKey: input.idempotencyKey,
    data: input.data || {},
    priority: input.priority || 1,
    from: input.from || null,
    subject: input.subject || null,
    provider: input.provider || null
  };
}

function buildDocument(input, options = {}) {
  const email = input.recipient?.email || input.to;
  const deliveryId = input.deliveryId || createDeliveryId();
  const now = new Date();
  return {
    _id: deliveryId,
    deliveryId,
    tenantScope: input.tenantScope,
    organizationId: input.organizationId || "",
    userId: input.userId || "",
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    recipientMasked: maskEmail(email),
    recipientHash: hashRecipient(email),
    template: input.template,
    provider: input.provider || null,
    status: input.status || "created",
    priority: input.priority || 1,
    providerMessageId: null,
    durationMs: null,
    attempts: 0,
    errorCategory: null,
    errorCode: null,
    errorMessage: null,
    finalizedAt: null,
    recoveryClaimedAt: null,
    recoveryLeaseUntil: null,
    recoveryCount: 0,
    ...(options.includeOutbox ? { outboxPayload: buildOutboxPayload(input) } : {}),
    createdAt: now,
    updatedAt: now
  };
}

async function claim(input) {
  const identity = {
    tenantScope: input.tenantScope,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey
  };
  const Model = getModel();
  if (Model) {
    if (indexState === "unknown") await refreshReadiness();
    if (input.requireDurable && indexState !== "ready") {
      const error = new Error("Email idempotency index is not ready");
      error.code = "EMAIL_IDEMPOTENCY_INDEX_MISSING";
      throw error;
    }
    const proposed = buildDocument(input, { includeOutbox: true });
    try {
      const value = await Model.findOneAndUpdate(
        identity,
        { $setOnInsert: proposed },
        { upsert: true, returnDocument: "after" }
      );
      const delivery = value.toObject ? value.toObject() : value;
      return { delivery, created: delivery.deliveryId === proposed.deliveryId, durable: true };
    } catch (error) {
      if (error?.code === 11000) {
        const existing = await Model.findOne(identity).lean();
        return { delivery: existing, created: false, durable: true };
      }
      throw error;
    }
  }

  if (input.requireDurable) {
    const error = new Error("Durable email history is unavailable");
    error.code = "EMAIL_DURABLE_HISTORY_UNAVAILABLE";
    throw error;
  }

  const existing = memoryStore.find((entry) =>
    entry.tenantScope === identity.tenantScope &&
    entry.eventType === identity.eventType &&
    entry.idempotencyKey === identity.idempotencyKey
  );
  if (existing) return { delivery: existing, created: false, durable: false };
  // The non-durable memory fallback deliberately never keeps raw recipient/data
  // beyond the caller input. It is not an outbox authority.
  const delivery = buildDocument(input, { includeOutbox: false });
  memoryStore.push(delivery);
  return { delivery, created: true, durable: false };
}

function buildSafeUpdates(updates, now = new Date()) {
  const safe = {
    ...updates,
    updatedAt: now
  };
  delete safe.error;
  delete safe.outboxPayload;
  delete safe.recoveryLeaseUntil;
  delete safe.recoveryClaimedAt;
  if (updates.errorMessage || updates.error) {
    safe.errorMessage = sanitizeProviderError(updates.errorMessage || updates.error);
  }
  if (safe.status === "queued") safe.queuedAt = now;
  if (safe.status === "processing") safe.processingAt = now;
  if (safe.status === "sent") safe.sentAt = now;
  if (safe.status === "failed") safe.failedAt = now;
  return safe;
}

async function updateDelivery(deliveryId, updates) {
  const now = new Date();
  const safe = buildSafeUpdates(updates, now);
  const Model = getModel();
  if (Model) {
    const operation = { $set: safe };
    if (AUTO_FINAL_STATUSES.has(safe.status)) {
      operation.$set.finalizedAt = now;
      operation.$unset = {
        outboxPayload: 1,
        recoveryLeaseUntil: 1,
        recoveryClaimedAt: 1
      };
    }
    await Model.updateOne({ deliveryId }, operation);
    return Model.findOne({ deliveryId }).lean();
  }
  const entry = memoryStore.find((item) => item.deliveryId === deliveryId || item._id === deliveryId);
  if (entry) {
    Object.assign(entry, safe);
    if (AUTO_FINAL_STATUSES.has(safe.status)) entry.finalizedAt = now;
  }
  return entry || null;
}

async function finalizeDelivery(deliveryId, updates = {}) {
  const now = new Date();
  const safe = buildSafeUpdates(updates, now);
  safe.finalizedAt = now;
  const Model = getModel();
  if (Model) {
    await Model.updateOne(
      { deliveryId },
      {
        $set: safe,
        $unset: {
          outboxPayload: 1,
          recoveryLeaseUntil: 1,
          recoveryClaimedAt: 1
        }
      }
    );
    return Model.findOne({ deliveryId }).lean();
  }
  const entry = memoryStore.find((item) => item.deliveryId === deliveryId || item._id === deliveryId);
  if (entry) Object.assign(entry, safe);
  return entry || null;
}

async function getByDeliveryId(deliveryId) {
  const Model = getModel();
  if (Model) return Model.findOne({ deliveryId }).lean();
  return memoryStore.find((item) => item.deliveryId === deliveryId) || null;
}

async function getOutboxByDeliveryId(deliveryId) {
  const Model = getModel();
  if (!Model) return null;
  return Model.findOne({ deliveryId, finalizedAt: null })
    .select("+outboxPayload")
    .lean();
}

async function quarantineUnsafeProviderResults(options = {}) {
  const Model = getModel();
  if (!Model) return 0;
  const now = options.now instanceof Date ? options.now : new Date();
  const staleMs = Math.max(1000, Number(options.staleMs) || 120000);
  const replayWindowMs = Math.max(
    staleMs,
    Number(options.providerReplayWindowMs) || DEFAULT_PROVIDER_REPLAY_WINDOW_MS
  );
  const genericProviderCutoff = new Date(now.getTime() - staleMs);
  const resendCutoff = new Date(now.getTime() - replayWindowMs);
  const result = await Model.updateMany(
    {
      finalizedAt: null,
      status: { $in: ["processing", "failed"] },
      outboxPayload: { $exists: true, $ne: null },
      $or: [
        {
          provider: "resend",
          updatedAt: { $lt: resendCutoff }
        },
        {
          provider: { $ne: "resend" },
          updatedAt: { $lte: genericProviderCutoff }
        }
      ]
    },
    {
      $set: {
        status: PROVIDER_RESULT_UNKNOWN_STATUS,
        finalizedAt: now,
        updatedAt: now,
        errorCategory: PROVIDER_RESULT_UNKNOWN_STATUS,
        errorCode: "PROVIDER_RESULT_UNKNOWN",
        errorMessage: "Provider result could not be proven safely; automatic retry suppressed"
      },
      $unset: {
        outboxPayload: 1,
        recoveryLeaseUntil: 1,
        recoveryClaimedAt: 1
      }
    }
  );
  return Number(result.modifiedCount || 0);
}

async function claimRecoverableDelivery(options = {}) {
  const Model = getModel();
  if (!Model) return null;
  const now = options.now instanceof Date ? options.now : new Date();
  const staleBefore = options.staleBefore instanceof Date
    ? options.staleBefore
    : new Date(now.getTime() - Math.max(1, Number(options.staleMs) || 120000));
  const leaseMs = Math.max(1000, Number(options.leaseMs) || 60000);
  const replayWindowMs = Math.max(
    1000,
    Number(options.providerReplayWindowMs) || DEFAULT_PROVIDER_REPLAY_WINDOW_MS
  );
  const resendReplayAfter = new Date(now.getTime() - replayWindowMs);

  return Model.findOneAndUpdate(
    {
      finalizedAt: null,
      outboxPayload: { $exists: true, $ne: null },
      $and: [
        {
          $or: [
            {
              status: { $in: SAFE_REQUEUE_STATUSES },
              updatedAt: { $lte: staleBefore }
            },
            {
              status: { $in: ["processing", "failed"] },
              provider: "resend",
              updatedAt: { $lte: staleBefore, $gte: resendReplayAfter }
            }
          ]
        },
        {
          $or: [
            { recoveryLeaseUntil: null },
            { recoveryLeaseUntil: { $exists: false } },
            { recoveryLeaseUntil: { $lte: now } }
          ]
        }
      ]
    },
    {
      $set: {
        recoveryClaimedAt: now,
        recoveryLeaseUntil: new Date(now.getTime() + leaseMs)
      },
      $inc: { recoveryCount: 1 }
    },
    { returnDocument: "after", sort: { updatedAt: 1 } }
  ).select("+outboxPayload").lean();
}

async function releaseRecoveryLease(deliveryId, updates = {}, options = {}) {
  const Model = getModel();
  if (!Model) return null;
  const referenceNow = options.now instanceof Date ? options.now : new Date();
  const safe = buildSafeUpdates(updates, referenceNow);
  await Model.updateOne(
    { deliveryId },
    {
      $set: safe,
      $unset: {
        recoveryLeaseUntil: 1,
        recoveryClaimedAt: 1
      }
    }
  );
  return Model.findOne({ deliveryId }).lean();
}

async function log(entry) {
  const scope = entry.tenantScope || entry.metadata?.organizationId || `legacy:${entry.metadata?.userId || "global"}`;
  const result = await claim({
    tenantScope: scope,
    organizationId: entry.metadata?.organizationId,
    userId: entry.metadata?.userId,
    eventType: entry.eventType || `LEGACY_${String(entry.template || "EMAIL").toUpperCase().replace(/-/g, "_")}`,
    idempotencyKey: entry.idempotencyKey || `legacy:${createDeliveryId()}`,
    recipient: { email: Array.isArray(entry.to) ? entry.to[0] : entry.to },
    template: entry.template,
    provider: entry.provider,
    priority: entry.priority,
    status: entry.status
  });
  return updateDelivery(result.delivery.deliveryId, {
    status: entry.status,
    providerMessageId: entry.messageId,
    durationMs: entry.durationMs,
    attempts: entry.attempts,
    errorMessage: entry.error
  });
}

const updateStatus = updateDelivery;

async function query(filters = {}) {
  const Model = getModel();
  if (Model) {
    const query = {};
    for (const key of ["organizationId", "userId", "template", "status", "provider", "eventType", "tenantScope"]) {
      if (filters[key]) query[key] = filters[key];
    }
    return Model.find(query).sort({ createdAt: -1 }).limit(Math.min(filters.limit || 50, 200)).lean();
  }
  return memoryStore
    .filter((entry) => Object.entries(filters).every(([key, value]) => ["limit", "skip"].includes(key) || !value || entry[key] === value))
    .slice(filters.skip || 0, (filters.skip || 0) + Math.min(filters.limit || 50, 200));
}

async function getStats(filters = {}) {
  const entries = await query({ ...filters, limit: 200 });
  return {
    total: entries.length,
    sent: entries.filter((e) => e.status === "sent").length,
    failed: entries.filter((e) => e.status === "failed").length,
    providerResultUnknown: entries.filter((e) => e.status === PROVIDER_RESULT_UNKNOWN_STATUS).length,
    bounced: entries.filter((e) => e.errorCategory === "bounce").length,
    avgDurationMs: null,
    totalAttempts: entries.reduce((sum, e) => sum + (e.attempts || 0), 0)
  };
}

function getReadiness() {
  const mongodb = Boolean(getModel());
  return {
    durable: mongodb && indexState === "ready",
    mode: mongodb ? "mongo" : "memory",
    index: indexState,
    idempotencyIndex: indexState === "ready"
  };
}

function resetMemoryStore() {
  memoryStore = [];
}

module.exports = {
  configurePersistence,
  refreshReadiness,
  claim,
  updateDelivery,
  updateStatus,
  finalizeDelivery,
  getByDeliveryId,
  getOutboxByDeliveryId,
  quarantineUnsafeProviderResults,
  claimRecoverableDelivery,
  releaseRecoveryLease,
  log,
  query,
  getStats,
  getReadiness,
  resetMemoryStore,
  PROVIDER_RESULT_UNKNOWN_STATUS,
  DEFAULT_PROVIDER_REPLAY_WINDOW_MS
};