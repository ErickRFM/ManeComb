const crypto = require("crypto");
const { maskEmail, hashRecipient, sanitizeProviderError } = require("../security");

let mongoose = null;
let indexState = "unavailable";

let HistoryModel = null;
let memoryStore = [];

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
        enum: ["created", "queued", "processing", "sent", "failed", "skipped", "dry_run"],
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

function buildDocument(input) {
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
    const proposed = buildDocument(input);
    try {
      const value = await Model.findOneAndUpdate(
        identity,
        { $setOnInsert: proposed },
        { upsert: true, new: true }
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
  const delivery = buildDocument(input);
  memoryStore.push(delivery);
  return { delivery, created: true, durable: false };
}

async function updateDelivery(deliveryId, updates) {
  const now = new Date();
  const safe = {
    ...updates,
    updatedAt: now
  };
  delete safe.error;
  if (updates.errorMessage || updates.error) {
    safe.errorMessage = sanitizeProviderError(updates.errorMessage || updates.error);
  }
  if (safe.status === "queued") safe.queuedAt = now;
  if (safe.status === "processing") safe.processingAt = now;
  if (safe.status === "sent") safe.sentAt = now;
  if (safe.status === "failed") safe.failedAt = now;
  const Model = getModel();
  if (Model) {
    await Model.updateOne({ deliveryId }, { $set: safe });
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
    bounced: entries.filter((e) => e.errorCategory === "bounce").length,
    avgDurationMs: null,
    totalAttempts: entries.reduce((sum, e) => sum + (e.attempts || 0), 0)
  };
}

function getReadiness() {
  const mongodb = Boolean(getModel());
  return {
    durable: mongodb && indexState === "ready",
    mode: mongodb ? "mongodb" : "memory",
    index: indexState
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
  getByDeliveryId,
  log,
  query,
  getStats,
  getReadiness,
  resetMemoryStore
};
