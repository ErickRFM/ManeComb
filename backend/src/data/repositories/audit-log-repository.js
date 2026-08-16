const { AuditLogModel } = require("../models");

const AUDIT_LOG_METHODS = ["createAuditLog", "listAuditLogsForActor"];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toPlain(entry) {
  if (!entry) return null;
  const source = typeof entry.toObject === "function" ? entry.toObject() : { ...entry };
  const id = source.id ?? source._id ?? null;
  const { _id, __v, ...rest } = source;
  return { id, ...rest };
}

function normalizeLimit(value) {
  return Math.max(1, Math.min(100, Number(value) || 50));
}

function normalizeDate(value) {
  const parsed = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

class AuditLogRepository {
  constructor(store, models = {}) {
    this.store = store;
    this.AuditLogModel = models.AuditLogModel || AuditLogModel;
    this.memoryEntries = [];
  }

  isMongoReady() {
    return this.AuditLogModel?.db?.readyState === 1;
  }

  async createAuditLog(entry) {
    if (this.isMongoReady()) {
      const created = await this.AuditLogModel.create(entry);
      return toPlain(created);
    }

    if (typeof this.store?.createAuditLog === "function") {
      return this.store.createAuditLog(entry);
    }

    const normalized = toPlain(entry);
    this.memoryEntries.unshift(clone(normalized));
    return clone(normalized);
  }

  async listAuditLogsForActor({ organizationId, actorId, since, limit = 50 } = {}) {
    const safeOrganizationId = String(organizationId || "").trim();
    const safeActorId = String(actorId || "").trim();
    const safeSince = normalizeDate(since);
    const safeLimit = normalizeLimit(limit);

    if (!safeOrganizationId || !safeActorId) return [];

    if (this.isMongoReady()) {
      const entries = await this.AuditLogModel.find({
        createdAt: { $gte: safeSince },
        $or: [{ organizationId: safeOrganizationId }, { actorId: safeActorId }]
      })
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .lean();
      return entries.map(toPlain);
    }

    if (typeof this.store?.listAuditLogsForActor === "function") {
      return this.store.listAuditLogsForActor({
        organizationId: safeOrganizationId,
        actorId: safeActorId,
        since: safeSince,
        limit: safeLimit
      });
    }

    return this.memoryEntries
      .filter((entry) => {
        const createdAt = normalizeDate(entry.createdAt);
        const belongsToViewer =
          String(entry.organizationId || "").trim() === safeOrganizationId ||
          String(entry.actorId || "").trim() === safeActorId;
        return belongsToViewer && createdAt >= safeSince;
      })
      .sort((left, right) => normalizeDate(right.createdAt) - normalizeDate(left.createdAt))
      .slice(0, safeLimit)
      .map(clone);
  }
}

module.exports = {
  AUDIT_LOG_METHODS,
  AuditLogRepository,
  normalizeLimit,
  toPlain
};
