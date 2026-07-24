const { verifyPlatformToken, PlatformAuthNotConfigured } = require("../utils/platform-jwt");
const { getPlatformSessionById } = require("../services/platform-sessions");

function sanitizePlatformUser(platformUser) {
  if (!platformUser) return null;
  return {
    id: platformUser._id,
    name: platformUser.name,
    email: platformUser.email,
    role: platformUser.role,
    status: platformUser.status,
    createdAt: platformUser.createdAt,
    lastLoginAt: platformUser.lastLoginAt
  };
}

async function platformAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Token requerido" });
  }

  try {
    const payload = verifyPlatformToken(header.replace("Bearer ", "").trim());

    if (payload.tokenType !== "platform") {
      return res.status(401).json({ ok: false, message: "Token inválido" });
    }

    if (!payload.sub || !payload.sid) {
      return res.status(401).json({ ok: false, message: "Token inválido" });
    }

    const store = req.app.locals.store;
    if (!store) {
      return res.status(500).json({ ok: false, message: "Store no disponible" });
    }

    const user = await store.getPlatformUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ ok: false, message: "Sesión inválida" });
    }

    if (user.status === "suspended") {
      return res.status(403).json({ ok: false, message: "Cuenta suspendida" });
    }
    if (user.status === "disabled") {
      return res.status(401).json({ ok: false, message: "Cuenta deshabilitada" });
    }

    const session = await getPlatformSessionById(payload.sid);
    if (!session || !session.isActive || session.revokedAt || (session.userId !== payload.sub)) {
      return res.status(401).json({ ok: false, message: "Sesión expirada o revocada" });
    }

    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ ok: false, message: "Sesión expirada" });
    }

    req.platformAuth = payload;
    req.platformUser = sanitizePlatformUser(user);
    req.platformSession = session;

    return next();
  } catch (error) {
    if (error instanceof PlatformAuthNotConfigured) {
      return res.status(503).json({ ok: false, message: "Autenticación de plataforma no disponible" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, message: "Token expirado" });
    }
    return res.status(401).json({ ok: false, message: "Token inválido" });
  }
}

module.exports = { platformAuth, sanitizePlatformUser };
