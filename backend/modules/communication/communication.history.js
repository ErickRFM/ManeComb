const mongoose = require("mongoose");
const logger = require("../../src/services/logger");

const HISTORY_SCHEMA = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    userId: { type: String, default: "", index: true },
    to: { type: [String], required: true },
    template: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "sending", "sent", "delivered", "failed", "bounced", "rejected"],
      required: true,
      index: true
    },
    priority: { type: Number, default: 1 },
    subject: { type: String, default: "" },
    messageId: { type: String, default: null },
    durationMs: { type: Number, default: null },
    attempts: { type: Number, default: 1 },
    maxAttempts: { type: Number, default: 3 },
    error: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    collection: "communication_history",
    versionKey: false
  }
);

HISTORY_SCHEMA.index({ createdAt: -1 });
HISTORY_SCHEMA.index({ status: 1, createdAt: -1 });
HISTORY_SCHEMA.index({ template: 1, createdAt: -1 });
HISTORY_SCHEMA.index({ provider: 1, status: 1 });

let HistoryModel = null;

function getModel() {
  if (!HistoryModel) {
    if (mongoose.connection?.readyState === 1 || mongoose.connection?.readyState === 2) {
      HistoryModel = mongoose.model("CommunicationHistory", HISTORY_SCHEMA);
    }
  }
  return HistoryModel;
}

let memoryStore = [];

async function log(entry) {
  const doc = {
    _id: `comm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: entry.metadata?.organizationId || "",
    userId: entry.metadata?.userId || "",
    to: entry.to || [],
    template: entry.template,
    provider: entry.provider,
    status: entry.status,
    priority: entry.priority || 1,
    subject: entry.subject || "",
    messageId: entry.messageId || null,
    durationMs: entry.durationMs || null,
    attempts: entry.attempts || 1,
    maxAttempts: entry.maxAttempts || 3,
    error: entry.error || null,
    metadata: entry.metadata || null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const Model = getModel();
  if (Model) {
    try {
      await Model.create(doc);
    } catch (err) {
      logger.warn({
        action: "HistoryLogMongoError",
        module: "Communication",
        message: "No se pudo guardar historial en MongoDB",
        error: err
      });
      memoryStore.push(doc);
    }
  } else {
    memoryStore.push(doc);
  }

  return doc;
}

async function updateStatus(id, updates) {
  const Model = getModel();
  if (Model) {
    try {
      await Model.updateOne({ _id: id }, { $set: { ...updates, updatedAt: new Date() } });
    } catch {
      const entry = memoryStore.find((e) => e._id === id);
      if (entry) Object.assign(entry, updates, { updatedAt: new Date() });
    }
  } else {
    const entry = memoryStore.find((e) => e._id === id);
    if (entry) Object.assign(entry, updates, { updatedAt: new Date() });
  }
}

async function query(filters = {}) {
  const Model = getModel();
  if (Model) {
    try {
      const query = {};
      if (filters.organizationId) query.organizationId = filters.organizationId;
      if (filters.userId) query.userId = filters.userId;
      if (filters.template) query.template = filters.template;
      if (filters.status) query.status = filters.status;
      if (filters.provider) query.provider = filters.provider;
      if (filters.from && filters.to) {
        query.createdAt = { $gte: new Date(filters.from), $lte: new Date(filters.to) };
      } else if (filters.from) {
        query.createdAt = { $gte: new Date(filters.from) };
      } else if (filters.to) {
        query.createdAt = { $lte: new Date(filters.to) };
      }

      const limit = Math.min(filters.limit || 50, 200);
      const skip = filters.skip || 0;

      return await Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    } catch {
      return queryMemory(filters);
    }
  }

  return queryMemory(filters);
}

function queryMemory(filters) {
  let results = [...memoryStore];

  if (filters.organizationId) results = results.filter((e) => e.organizationId === filters.organizationId);
  if (filters.userId) results = results.filter((e) => e.userId === filters.userId);
  if (filters.template) results = results.filter((e) => e.template === filters.template);
  if (filters.status) results = results.filter((e) => e.status === filters.status);
  if (filters.provider) results = results.filter((e) => e.provider === filters.provider);
  if (filters.from) results = results.filter((e) => new Date(e.createdAt) >= new Date(filters.from));
  if (filters.to) results = results.filter((e) => new Date(e.createdAt) <= new Date(filters.to));

  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const limit = Math.min(filters.limit || 50, 200);
  const skip = filters.skip || 0;
  return results.slice(skip, skip + limit);
}

async function getStats(filters = {}) {
  const Model = getModel();
  if (Model) {
    try {
      const match = {};
      if (filters.organizationId) match.organizationId = filters.organizationId;
      if (filters.template) match.template = filters.template;
      if (filters.from || filters.to) {
        match.createdAt = {};
        if (filters.from) match.createdAt.$gte = new Date(filters.from);
        if (filters.to) match.createdAt.$lte = new Date(filters.to);
      }

      const stats = await Model.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
            bounced: { $sum: { $cond: [{ $eq: ["$status", "bounced"] }, 1, 0] } },
            avgDurationMs: { $avg: "$durationMs" },
            totalAttempts: { $sum: "$attempts" }
          }
        }
      ]);

      return stats[0] || { total: 0, sent: 0, failed: 0, bounced: 0, avgDurationMs: null, totalAttempts: 0 };
    } catch {
      return getMemoryStats(filters);
    }
  }

  return getMemoryStats(filters);
}

function getMemoryStats(filters) {
  let results = [...memoryStore];
  if (filters.organizationId) results = results.filter((e) => e.organizationId === filters.organizationId);
  if (filters.template) results = results.filter((e) => e.template === filters.template);
  if (filters.from) results = results.filter((e) => new Date(e.createdAt) >= new Date(filters.from));
  if (filters.to) results = results.filter((e) => new Date(e.createdAt) <= new Date(filters.to));

  const sent = results.filter((e) => e.status === "sent").length;
  const failed = results.filter((e) => e.status === "failed").length;
  const bounced = results.filter((e) => e.status === "bounced").length;
  const durations = results.filter((e) => e.durationMs != null).map((e) => e.durationMs);
  const avgDurationMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  return {
    total: results.length,
    sent,
    failed,
    bounced,
    avgDurationMs,
    totalAttempts: results.reduce((a, e) => a + (e.attempts || 1), 0)
  };
}

function resetMemoryStore() {
  memoryStore = [];
}

module.exports = {
  log,
  updateStatus,
  query,
  getStats,
  resetMemoryStore,
  get HISTORY_SCHEMA() {
    return HISTORY_SCHEMA;
  }
};
