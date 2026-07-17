const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const { AuditLogModel } = require("../data/models");
const { getOrganizationId } = require("../middlewares/access-control");

function getRequestIp(req) {
  return String(
    req.headers["cf-connecting-ip"] ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      req.ip ||
      ""
  )
    .split(",")[0]
    .trim();
}

function getUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 512);
}

async function recordAuditLog(req, payload = {}) {
  const actorId = payload.actorId || req?.user?.id || null;
  const organizationId =
    payload.organizationId || getOrganizationId(req?.user) || String(payload.metadata?.organizationId || "");

  const entry = {
    _id: randomUUID(),
    actorId,
    organizationId,
    action: String(payload.action || payload.type || "unknown").trim(),
    targetType: String(payload.targetType || payload.scope || "").trim(),
    targetId: payload.targetId || payload.entityId || null,
    ip: payload.ip || (req ? getRequestIp(req) : ""),
    userAgent: payload.userAgent || (req ? getUserAgent(req) : ""),
    severity: String(payload.severity || payload.level || "info").trim(),
    metadata: payload.metadata || null,
    createdAt: new Date()
  };

  if (mongoose.connection.readyState === 1) {
    await AuditLogModel.create(entry).catch(() => undefined);
  }
  try {
    await req?.app?.locals?.store?.recordAppEvent?.({
      type: entry.action,
      scope: "audit",
      level: entry.severity,
      status: payload.status || "ok",
      userId: actorId,
      entityId: entry.targetId,
      message: payload.message || entry.action,
      metadata: {
        organizationId,
        targetType: entry.targetType,
        traceId: req?.traceId,
        ...payload.metadata
      }
    });
  } catch {
    // Audit events must never break the user-facing request.
  }

  return entry;
}

module.exports = {
  getRequestIp,
  getUserAgent,
  recordAuditLog
};
