const bcrypt = require("bcryptjs");
const { signPlatformToken } = require("../../utils/platform-jwt");
const { createPlatformSession, rotatePlatformRefreshToken } = require("../../services/platform-sessions");
const { recordPlatformAction } = require("../../services/platform-audit");
const { sanitizePlatformUser } = require("../../middlewares/platform-auth");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 30 * 60 * 1000;

function getStore(req) {
  return req.app.locals.store;
}

async function login(email, password, req) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await getStore(req).getPlatformUserByEmail(normalizedEmail);

  if (!user) {
    await recordPlatformAction(req, {
      action: "platform.auth.failed_login",
      actorId: null,
      metadata: { email: normalizedEmail, result: "failed", reasonCode: "user_not_found" }
    });
    return { error: "Credenciales inválidas", status: 401 };
  }

  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    return { error: "Credenciales inválidas", status: 401 };
  }

  if (user.status === "suspended") {
    return { error: "Credenciales inválidas", status: 401 };
  }
  if (user.status === "disabled") {
    return { error: "Credenciales inválidas", status: 401 };
  }

  const isValid = bcrypt.compareSync(password, user.passwordHash);
  if (!isValid) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const update = { failedLoginAttempts: attempts };
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      update.lockedUntil = new Date(Date.now() + LOCKOUT_WINDOW_MS);
    }
    await getStore(req).updatePlatformUser(user._id, update);

    await recordPlatformAction(req, {
      action: "platform.auth.failed_login",
      actorId: user._id,
      platformRole: user.role,
      metadata: { result: "failed", reasonCode: "invalid_password", attemptCount: attempts }
    });
    return { error: "Credenciales inválidas", status: 401 };
  }

  await getStore(req).updatePlatformUser(user._id, {
    lastLoginAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null
  });

  const { refreshToken, session } = await createPlatformSession(user._id, req);
  const token = signPlatformToken(user, session.id);

  await recordPlatformAction(req, {
    action: "platform.auth.login",
    actorId: user._id,
    platformRole: user.role,
    metadata: { result: "success", sessionId: session.id }
  });

  return {
    token,
    refreshToken,
    session: {
      id: session.id,
      expiresAt: session.expiresAt
    },
    user: sanitizePlatformUser(user)
  };
}

async function refresh(refreshTokenValue, req) {
  try {
    const result = await rotatePlatformRefreshToken(refreshTokenValue, req);
    if (!result) {
      return { error: "Refresh token inválido o expirado", status: 401 };
    }

    const user = await getStore(req).getPlatformUserById(result.session.userId);
    if (!user || user.status !== "active") {
      return { error: "Cuenta no activa", status: 401 };
    }

    const token = signPlatformToken(user, result.session.id);

    await recordPlatformAction(req, {
      action: "platform.auth.refresh",
      actorId: user._id,
      platformRole: user.role,
      metadata: { result: "success", sessionId: result.session.id }
    });

    return {
      token,
      refreshToken: result.refreshToken,
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt
      }
    };
  } catch {
    return { error: "Refresh token inválido", status: 401 };
  }
}

async function getSession(req) {
  const user = req.platformUser;
  const session = req.platformSession;
  return {
    user,
    session: {
      id: session._id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      ip: session.ip,
      userAgent: session.userAgent,
      platform: session.platform,
      deviceName: session.deviceName,
      mfaVerified: session.mfaVerified
    }
  };
}

async function logout(req) {
  const userId = req.platformUser.id;
  const sessionId = req.platformSession._id;
  const { revokePlatformSession } = require("../../services/platform-sessions");

  await revokePlatformSession(userId, sessionId, "logout");

  await recordPlatformAction(req, {
    action: "platform.auth.logout",
    actorId: userId,
    platformRole: req.platformUser.role,
    metadata: { result: "success", sessionId }
  });

  return { message: "Sesión cerrada" };
}

async function logoutAll(req) {
  const userId = req.platformUser.id;
  const currentSessionId = req.platformSession._id;
  const { revokeAllPlatformSessions } = require("../../services/platform-sessions");

  const count = await revokeAllPlatformSessions(userId, currentSessionId, "global_logout");

  await recordPlatformAction(req, {
    action: "platform.auth.logout_all",
    actorId: userId,
    platformRole: req.platformUser.role,
    metadata: { result: "success", revokedCount: count }
  });

  return { message: "Todas las sesiones cerradas", revokedCount: count };
}

module.exports = {
  login,
  refresh,
  getSession,
  logout,
  logoutAll,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_WINDOW_MS
};
