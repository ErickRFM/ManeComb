const crypto = require("crypto");
const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const { PlatformSessionModel } = require("../data/models");
const { PLATFORM_REFRESH_TOKEN_TTL_DAYS } = require("../config/env");
const { getRequestIp, getUserAgent } = require("./audit");

const memoryPlatformSessions = new Map();

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
  return new Date(Date.now() + PLATFORM_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
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

async function createPlatformSession(userId, req) {
  const refreshToken = createRefreshToken();
  const userAgent = getUserAgent(req);
  const sessionPayload = {
    _id: randomUUID(),
    userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    ip: getRequestIp(req),
    userAgent,
    platform: inferPlatform(userAgent),
    deviceName: inferDeviceName(userAgent),
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: getRefreshTokenExpiration(),
    revokedAt: null,
    revokedReason: "",
    isActive: true,
    mfaVerified: false
  };

  if (!isMongoReady()) {
    memoryPlatformSessions.set(sessionPayload._id, sessionPayload);
    return { refreshToken, session: serializePlatformSession(sessionPayload, sessionPayload._id) };
  }

  const session = await PlatformSessionModel.create(sessionPayload);
  return { refreshToken, session: serializePlatformSession(session, session._id) };
}

function serializePlatformSession(session, currentSessionId) {
  if (!session) return null;
  const plain = typeof session.toObject === "function" ? session.toObject() : session;
  return {
    id: plain._id,
    userId: plain.userId,
    ip: plain.ip,
    userAgent: plain.userAgent,
    platform: plain.platform,
    deviceName: plain.deviceName,
    createdAt: plain.createdAt,
    lastSeenAt: plain.lastSeenAt,
    expiresAt: plain.expiresAt,
    revokedAt: plain.revokedAt,
    revokedReason: plain.revokedReason,
    isActive: Boolean(plain.isActive && !plain.revokedAt),
    mfaVerified: Boolean(plain.mfaVerified),
    current: currentSessionId ? plain._id === currentSessionId : false
  };
}

async function rotatePlatformRefreshToken(refreshToken, req) {
  const tokenHash = hashRefreshToken(refreshToken);

  if (!isMongoReady()) {
    const session = [...memoryPlatformSessions.values()].find(
      (entry) =>
        entry.refreshTokenHash === tokenHash &&
        entry.isActive &&
        !entry.revokedAt &&
        new Date(entry.expiresAt).getTime() > Date.now()
    );
    if (!session) return null;
    const nextRefreshToken = createRefreshToken();
    session.refreshTokenHash = hashRefreshToken(nextRefreshToken);
    session.lastSeenAt = new Date();
    session.ip = getRequestIp(req);
    session.userAgent = getUserAgent(req);
    memoryPlatformSessions.set(session._id, session);
    return { refreshToken: nextRefreshToken, session: serializePlatformSession(session, session._id) };
  }

  const session = await PlatformSessionModel.findOne({
    refreshTokenHash: tokenHash,
    isActive: true,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (!session) return null;

  const nextRefreshToken = createRefreshToken();
  session.refreshTokenHash = hashRefreshToken(nextRefreshToken);
  session.lastSeenAt = new Date();
  session.ip = getRequestIp(req);
  session.userAgent = getUserAgent(req);
  await session.save();

  return { refreshToken: nextRefreshToken, session: serializePlatformSession(session, session._id) };
}

async function getPlatformSessionById(sessionId) {
  if (!isMongoReady()) {
    return memoryPlatformSessions.get(sessionId) || null;
  }
  const session = await PlatformSessionModel.findById(sessionId).lean();
  return session || null;
}

async function revokePlatformSession(userId, sessionId, reason) {
  if (!isMongoReady()) {
    const session = memoryPlatformSessions.get(sessionId);
    if (!session || session.userId !== userId) return null;
    session.isActive = false;
    session.revokedAt = new Date();
    session.revokedReason = reason || "logout";
    memoryPlatformSessions.set(sessionId, session);
    return serializePlatformSession(session);
  }

  const session = await PlatformSessionModel.findOneAndUpdate(
    { _id: sessionId, userId },
    { $set: { isActive: false, revokedAt: new Date(), revokedReason: reason || "logout" } },
    { returnDocument: "after" }
  ).lean();
  return serializePlatformSession(session);
}

async function revokeAllPlatformSessions(userId, exceptSessionId, reason) {
  if (!isMongoReady()) {
    let count = 0;
    memoryPlatformSessions.forEach((session, sid) => {
      if (session.userId !== userId || !session.isActive || session.revokedAt) return;
      if (exceptSessionId && sid === exceptSessionId) return;
      session.isActive = false;
      session.revokedAt = new Date();
      session.revokedReason = reason || "global_logout";
      memoryPlatformSessions.set(sid, session);
      count += 1;
    });
    return count;
  }

  const filter = { userId, isActive: true, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };

  const result = await PlatformSessionModel.updateMany(filter, {
    $set: { isActive: false, revokedAt: new Date(), revokedReason: reason || "global_logout" }
  });
  return result.modifiedCount || 0;
}

async function touchPlatformSession(sessionId) {
  if (!isMongoReady()) {
    const session = memoryPlatformSessions.get(sessionId);
    if (session) {
      session.lastSeenAt = new Date();
      memoryPlatformSessions.set(sessionId, session);
    }
    return;
  }
  await PlatformSessionModel.updateOne(
    { _id: sessionId },
    { $set: { lastSeenAt: new Date() } }
  );
}

module.exports = {
  createPlatformSession,
  serializePlatformSession,
  rotatePlatformRefreshToken,
  getPlatformSessionById,
  revokePlatformSession,
  revokeAllPlatformSessions,
  touchPlatformSession,
  hashRefreshToken,
  createRefreshToken
};
