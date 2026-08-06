const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { hasPlatformPermission } = require("../config/platform-roles");
const {
  PlatformAccessConfigurationError,
  getPlatformAccessConfiguration,
  assertPlatformAccessConfiguration
} = require("../config/platform-access");

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const jwksCache = new Map();

class PlatformAccessUnavailableError extends Error {
  constructor(message = "Cloudflare Access no está disponible") {
    super(message);
    this.name = "PlatformAccessUnavailableError";
    this.code = "PLATFORM_ACCESS_UNAVAILABLE";
    this.statusCode = 503;
  }
}

function clearPlatformAccessJwksCache() {
  jwksCache.clear();
}

async function fetchJwks(config, options = {}) {
  const now = Date.now();
  const cached = jwksCache.get(config.jwksUrl);
  if (cached && cached.expiresAt > now) return cached.keys;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new PlatformAccessUnavailableError("El runtime no dispone de fetch para consultar JWKS");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  try {
    const response = await fetchImpl(config.jwksUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new PlatformAccessUnavailableError(`JWKS respondió HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.keys) || !payload.keys.length) {
      throw new PlatformAccessUnavailableError("JWKS no contiene claves públicas");
    }
    jwksCache.set(config.jwksUrl, {
      expiresAt: now + JWKS_CACHE_TTL_MS,
      keys: payload.keys
    });
    return payload.keys;
  } catch (error) {
    if (error instanceof PlatformAccessUnavailableError) throw error;
    throw new PlatformAccessUnavailableError(
      error?.name === "AbortError" ? "La consulta JWKS excedió el tiempo límite" : "No fue posible consultar JWKS"
    );
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAudience(value) {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

function createPlatformAccessVerifier(options = {}) {
  return async function verifyPlatformAccessToken(token, suppliedConfig) {
    const config = assertPlatformAccessConfiguration({
      config: suppliedConfig || getPlatformAccessConfiguration(),
      allowHttp: options.allowHttp === true
    });
    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded?.header?.kid;
    if (!decoded || decoded.header?.alg !== "RS256" || !kid) {
      throw new Error("Access JWT inválido");
    }

    const keys = await fetchJwks(config, options);
    const jwk = keys.find((candidate) => candidate?.kid === kid && (!candidate.alg || candidate.alg === "RS256"));
    if (!jwk) throw new Error("La clave del Access JWT no existe en JWKS");

    let publicKey;
    try {
      publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    } catch {
      throw new Error("La clave JWKS no es válida");
    }

    const claims = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      audience: config.audience,
      issuer: config.issuer
    });
    if (!claims?.sub || claims.type !== "app") {
      throw new Error("Access JWT sin identidad de aplicación válida");
    }

    return {
      sub: String(claims.sub),
      email: typeof claims.email === "string" ? claims.email : null,
      audience: normalizeAudience(claims.aud),
      issuer: String(claims.iss || ""),
      type: String(claims.type)
    };
  };
}

const verifyPlatformAccessToken = createPlatformAccessVerifier();

async function platformAccess(req, res, next) {
  let config;
  try {
    config = assertPlatformAccessConfiguration();
  } catch (error) {
    if (error instanceof PlatformAccessConfigurationError) {
      return res.status(503).json({ ok: false, message: "Acceso privado no disponible" });
    }
    return next(error);
  }

  if (!config.enabled) return next();

  const token = String(req.headers?.[config.headerName] || "").trim();
  if (!token) {
    return res.status(403).json({ ok: false, message: "Acceso privado requerido" });
  }

  try {
    req.platformAccessIdentity = await verifyPlatformAccessToken(token, config);
    return next();
  } catch (error) {
    if (error instanceof PlatformAccessUnavailableError) {
      return res.status(503).json({ ok: false, message: "Acceso privado no disponible" });
    }
    return res.status(403).json({ ok: false, message: "Acceso privado inválido" });
  }
}

function requirePlatformRole(...roles) {
  return (req, res, next) => {
    const userRole = req.platformUser?.role;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ ok: false, message: "No tienes permisos suficientes" });
    }
    return next();
  };
}

function requirePlatformPermission(permission) {
  return (req, res, next) => {
    const userRole = req.platformUser?.role;
    if (!userRole || !hasPlatformPermission(userRole, permission)) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para realizar esta acción" });
    }
    return next();
  };
}

function requirePlatformStatus(...statuses) {
  return (req, res, next) => {
    const userStatus = req.platformUser?.status;
    if (!userStatus || !statuses.includes(userStatus)) {
      return res.status(403).json({ ok: false, message: "Cuenta no activa" });
    }
    return next();
  };
}

module.exports = {
  PlatformAccessUnavailableError,
  clearPlatformAccessJwksCache,
  createPlatformAccessVerifier,
  platformAccess,
  requirePlatformRole,
  requirePlatformPermission,
  requirePlatformStatus
};
