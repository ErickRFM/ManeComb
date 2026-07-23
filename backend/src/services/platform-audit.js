const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const { AuditLogModel } = require("../data/models");
const { getRequestIp } = require("./audit");

async function recordPlatformAction(req, payload) {
  const actorId = payload.actorId || req?.platformUser?.id || req?.platformAuth?.sub || null;

  const entry = {
    _id: randomUUID(),
    actorId,
    organizationId: "",
    action: String(payload.action || "platform.unknown").trim(),
    targetType: String(payload.targetType || "").trim(),
    targetId: payload.targetId || null,
    ip: payload.ip || (req ? getRequestIp(req) : ""),
    userAgent: payload.userAgent || (req ? String(req.headers["user-agent"] || "").slice(0, 512) : ""),
    severity: String(payload.severity || "info").trim(),
    metadata: {
      actorType: "platform",
      platformRole: payload.platformRole || req?.platformUser?.role || null,
      result: payload.result || "success",
      reasonCode: payload.reasonCode || null,
      ...payload.metadata
    },
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
        targetType: entry.targetType,
        actorType: "platform",
        ...payload.metadata
      }
    });
  } catch {
    // Audit events must never break the user-facing request.
  }

  return entry;
}

async function recordPlatformSystemAction({ actorId, action, targetType, targetId, severity, metadata }) {
  const fakeReq = {
    platformUser: { id: actorId, role: metadata?.platformRole || "platform_owner" },
    platformAuth: { sub: actorId },
    headers: { "user-agent": "platform-script" },
    ip: "127.0.0.1",
    app: { locals: {} }
  };

  return recordPlatformAction(fakeReq, {
    actorId,
    action,
    targetType,
    targetId,
    severity: severity || "info",
    metadata: { ...metadata, actorType: "platform" }
  });
}

module.exports = {
  recordPlatformAction,
  recordPlatformSystemAction
};
