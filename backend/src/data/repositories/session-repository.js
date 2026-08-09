const { randomUUID } = require("crypto");
const { StoreDomainRepository } = require("./store-domain-repository");
const { toPlain } = require("../serializers");

const SESSION_METHODS = [
  "createRtcSession",
  "listRtcSessions",
  "recordAppEvent",
  "updateRtcSession"
];

class SessionRepository extends StoreDomainRepository {
  constructor(store, { AppEventModel, RtcSessionModel } = {}) {
    super(store, SESSION_METHODS);
    this.AppEventModel = AppEventModel || null;
    this.RtcSessionModel = RtcSessionModel || null;
  }

  async createRtcSession(payload) {
    if (!this.RtcSessionModel) {
      return this.store.createRtcSession(payload);
    }

    const session = await this.RtcSessionModel.create({
      _id: randomUUID(),
      organizationId: String(payload.organizationId || "").trim(),
      roomId: String(payload.roomId || "").trim(),
      initiatedBy: String(payload.initiatedBy || "").trim() || null,
      participantUserIds: payload.participantUserIds || [],
      participantNames: payload.participantNames || [],
      startedAt: new Date(),
      endedAt: null,
      durationSeconds: 0,
      status: "active",
      endReason: null,
      mode: payload.mode ? String(payload.mode) : null,
      usedRelay: null,
      sharedScreen: Boolean(payload.sharedScreen),
      offerCount: Math.max(0, Number(payload.offerCount) || 0),
      lastEventAt: new Date()
    });

    return toPlain(session);
  }

  async updateRtcSession(sessionId, payload) {
    if (!this.RtcSessionModel) {
      return this.store.updateRtcSession(sessionId, payload);
    }

    const existing = await this.RtcSessionModel.findById(sessionId).lean();

    if (!existing) {
      return null;
    }

    const update = {
      ...payload,
      lastEventAt: new Date()
    };
    const endedAt = payload.endedAt ? new Date(payload.endedAt) : existing.endedAt;
    const startedAt = existing.startedAt ? new Date(existing.startedAt) : null;

    if (startedAt && endedAt) {
      update.durationSeconds = Math.max(
        0,
        Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
      );
    }

    const session = await this.RtcSessionModel.findByIdAndUpdate(
      sessionId,
      { $set: update },
      { returnDocument: "after" }
    ).lean();

    return toPlain(session);
  }

  async listRtcSessions({ organizationId, roomId, limit = 20 } = {}) {
    if (!this.RtcSessionModel) {
      return this.store.listRtcSessions({ roomId, limit });
    }

    const query = {};
    if (organizationId) query.organizationId = String(organizationId).trim();
    if (roomId) query.roomId = roomId;
    const sessions = await this.RtcSessionModel.find(query)
      .sort({ startedAt: -1 })
      .limit(Math.max(1, Number(limit) || 20))
      .lean();

    return sessions.map((session) => toPlain(session));
  }

  async recordAppEvent(payload) {
    if (!this.AppEventModel) {
      return this.store.recordAppEvent(payload);
    }

    const type = String(payload?.type || "").trim();

    if (!type) {
      return null;
    }

    const event = await this.AppEventModel.create({
      _id: randomUUID(),
      type,
      scope: String(payload.scope || "system").trim() || "system",
      level: String(payload.level || "info").trim() || "info",
      status: String(payload.status || "ok").trim() || "ok",
      route: String(payload.route || "").trim(),
      method: String(payload.method || "").trim(),
      userId: payload.userId ? String(payload.userId).trim() : null,
      entityId: payload.entityId ? String(payload.entityId).trim() : null,
      message: String(payload.message || "").trim(),
      durationMs: Math.max(0, Number(payload.durationMs) || 0),
      metadata: payload.metadata || null,
      createdAt: new Date()
    });

    return toPlain(event);
  }
}

module.exports = {
  SESSION_METHODS,
  SessionRepository
};