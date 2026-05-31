const crypto = require("crypto");
const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const { SessionModel } = require("../data/models");
const { REFRESH_TOKEN_TTL_DAYS } = require("../config/env");
const { getOrganizationId } = require("../middlewares/access-control");
const { getRequestIp, getUserAgent } = require("./audit");

const memorySessions = new Map();

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function getRefreshTokenExpiration() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function inferPlatform(userAgent = "") {
  const value = String(userAgent).toLowerCase();
  if (value.includes("android")) return "android";
  if (value.includes("iphone") || value.includes("ipad")) return "ios";
  if (value.includes("windows") || value.includes("macintosh") || value.includes("linux")) return "web";
  return "unknown";
}

function inferDeviceName(userAgent = "") {
  const platform = inferPlatform(userAgent);
  if (platform === "android") return "Android";
  if (platform === "ios") return "iOS";
  if (platform === "web") return "Navegador web";
  return "Sesion";
}

async function createSessionForRequest(req, user) {
  const refreshToken = createRefreshToken();
  const userAgent = getUserAgent(req);
  const sessionPayload = {
    _id: randomUUID(),
    userId: user.id,
    organizationId: getOrganizationId(user),
    refreshTokenHash: hashRefreshToken(refreshToken),
    ip: getRequestIp(req),
    userAgent,
    platform: inferPlatform(userAgent),
    deviceName: inferDeviceName(userAgent),
    locationApprox: String(req.headers["cf-ipcountry"] || "").trim(),
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: getRefreshTokenExpiration(),
    revokedAt: null,
    revokedReason: "",
    isActive: true
  };

  if (!isMongoReady()) {
    memorySessions.set(sessionPayload._id, sessionPayload);

    return {
      refreshToken,
      session: serializeSession(sessionPayload, sessionPayload._id)
    };
  }

  const session = await SessionModel.create({
    ...sessionPayload
  });

  return {
    refreshToken,
    session: serializeSession(session, session._id)
  };
}

function serializeSession(session, currentSessionId = null) {
  if (!session) return null;
  const plain = typeof session.toObject === "function" ? session.toObject() : session;

  return {
    id: plain._id,
    userId: plain.userId,
    organizationId: plain.organizationId,
    ip: plain.ip,
    userAgent: plain.userAgent,
    platform: plain.platform,
    deviceName: plain.deviceName,
    locationApprox: plain.locationApprox,
    createdAt: plain.createdAt,
    lastSeenAt: plain.lastSeenAt,
    expiresAt: plain.expiresAt,
    revokedAt: plain.revokedAt,
    revokedReason: plain.revokedReason,
    isActive: Boolean(plain.isActive && !plain.revokedAt),
    current: currentSessionId ? plain._id === currentSessionId : false
  };
}

async function rotateRefreshToken(refreshToken, req) {
  const tokenHash = hashRefreshToken(refreshToken);

  if (!isMongoReady()) {
    const session = [...memorySessions.values()].find(
      (entry) =>
        entry.refreshTokenHash === tokenHash &&
        entry.isActive &&
        !entry.revokedAt &&
        new Date(entry.expiresAt).getTime() > Date.now()
    );

    if (!session) {
      return null;
    }

    const nextRefreshToken = createRefreshToken();
    session.refreshTokenHash = hashRefreshToken(nextRefreshToken);
    session.lastSeenAt = new Date();
    session.ip = getRequestIp(req);
    session.userAgent = getUserAgent(req);
    memorySessions.set(session._id, session);

    return {
      refreshToken: nextRefreshToken,
      session: serializeSession(session, session._id)
    };
  }

  const session = await SessionModel.findOne({
    refreshTokenHash: tokenHash,
    isActive: true,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!session) {
    return null;
  }

  const nextRefreshToken = createRefreshToken();
  session.refreshTokenHash = hashRefreshToken(nextRefreshToken);
  session.lastSeenAt = new Date();
  session.ip = getRequestIp(req);
  session.userAgent = getUserAgent(req);
  await session.save();

  return {
    refreshToken: nextRefreshToken,
    session: serializeSession(session, session._id)
  };
}

async function listSessionsForUser(userId, currentSessionId = null) {
  if (!isMongoReady()) {
    return [...memorySessions.values()]
      .filter((session) => session.userId === userId)
      .sort((left, right) => new Date(right.lastSeenAt) - new Date(left.lastSeenAt))
      .slice(0, 50)
      .map((session) => serializeSession(session, currentSessionId));
  }

  const sessions = await SessionModel.find({ userId })
    .sort({ lastSeenAt: -1 })
    .limit(50)
    .lean();

  return sessions.map((session) => serializeSession(session, currentSessionId));
}

async function revokeSession(userId, sessionId, reason = "revoked") {
  if (!isMongoReady()) {
    const session = memorySessions.get(sessionId);

    if (!session || session.userId !== userId) {
      return null;
    }

    session.isActive = false;
    session.revokedAt = new Date();
    session.revokedReason = reason;
    memorySessions.set(sessionId, session);
    return serializeSession(session);
  }

  const session = await SessionModel.findOneAndUpdate(
    { _id: sessionId, userId },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason
      }
    },
    { returnDocument: "after" }
  ).lean();

  return serializeSession(session);
}

async function revokeAllSessions(userId, exceptSessionId = null, reason = "global_logout") {
  if (!isMongoReady()) {
    let revokedCount = 0;

    memorySessions.forEach((session, sessionId) => {
      if (session.userId !== userId || !session.isActive || session.revokedAt) {
        return;
      }

      if (exceptSessionId && sessionId === exceptSessionId) {
        return;
      }

      session.isActive = false;
      session.revokedAt = new Date();
      session.revokedReason = reason;
      memorySessions.set(sessionId, session);
      revokedCount += 1;
    });

    return revokedCount;
  }

  const filter = {
    userId,
    isActive: true,
    revokedAt: null
  };

  if (exceptSessionId) {
    filter._id = { $ne: exceptSessionId };
  }

  const result = await SessionModel.updateMany(filter, {
    $set: {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: reason
    }
  });

  return result.modifiedCount || 0;
}

async function revokeRefreshToken(refreshToken, reason = "logout") {
  if (!isMongoReady()) {
    const tokenHash = hashRefreshToken(refreshToken);
    const session = [...memorySessions.values()].find(
      (entry) => entry.refreshTokenHash === tokenHash && entry.isActive
    );

    if (!session) {
      return null;
    }

    session.isActive = false;
    session.revokedAt = new Date();
    session.revokedReason = reason;
    memorySessions.set(session._id, session);
    return serializeSession(session);
  }

  const session = await SessionModel.findOneAndUpdate(
    {
      refreshTokenHash: hashRefreshToken(refreshToken),
      isActive: true
    },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason
      }
    },
    { returnDocument: "after" }
  ).lean();

  return serializeSession(session);
}

module.exports = {
  createSessionForRequest,
  hashRefreshToken,
  listSessionsForUser,
  revokeAllSessions,
  revokeRefreshToken,
  revokeSession,
  rotateRefreshToken,
  serializeSession
};
