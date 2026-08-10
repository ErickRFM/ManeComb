const rateLimitModule = require("express-rate-limit");
const rateLimit = rateLimitModule.rateLimit || rateLimitModule;
const logger = require("../services/logger");
const { verifyToken } = require("../utils/jwt");

const GENERAL_API_WINDOW_MS = 15 * 60 * 1000;
const GENERAL_API_MAX = 200;
// refreshAll() can legitimately burst roughly a dozen operational reads. A
// per-user 120/minute perimeter permits repeated reconciliations without sharing
// the anonymous/login budget, while still bounding authenticated loops/abuse.
const AUTHENTICATED_API_WINDOW_MS = 60 * 1000;
const AUTHENTICATED_API_MAX = 120;
const MEDIA_READ_WINDOW_MS = 60 * 1000;
const MEDIA_READ_MAX = 180;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "")
    .split("?")[0]
    .trim();
}

function isMediaReadRequest(req) {
  if (String(req?.method || "").toUpperCase() !== "GET") {
    return false;
  }

  const path = requestPath(req);

  return (
    /^\/api\/chat\/media\/[^/]+$/.test(path) ||
    /^\/api\/radio\/messages\/[^/]+\/audio$/.test(path)
  );
}

function isAuthApiRequest(req) {
  return /^\/api\/auth(?:\/|$)/.test(requestPath(req));
}

function getVerifiedBearerIdentity(req) {
  const authorization = String(req?.headers?.authorization || "").trim();
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  try {
    const payload = verifyToken(match[1]);
    const sub = String(payload?.sub || "").trim();
    if (!sub) return null;
    return {
      organizationId: String(payload?.organizationId || "").trim() || "no-org",
      sub
    };
  } catch {
    return null;
  }
}

function hasVerifiedBearerCredential(req) {
  return Boolean(getVerifiedBearerIdentity(req));
}

function selectGeneralApiRateLimitScope(req) {
  if (isMediaReadRequest(req) || isAuthApiRequest(req)) return "skip";
  return hasVerifiedBearerCredential(req) ? "authenticated" : "anonymous";
}

function shouldSkipGeneralApiRateLimit(req) {
  return selectGeneralApiRateLimitScope(req) !== "anonymous";
}

function authenticatedApiKey(req) {
  const identity = getVerifiedBearerIdentity(req);
  if (!identity) {
    throw new Error("Authenticated API limiter invoked without a verified Bearer identity");
  }
  return `auth:${identity.organizationId}:${identity.sub}`;
}

function retryAfterSeconds(req, windowMs) {
  const resetTime = req?.rateLimit?.resetTime;
  const resetAt = resetTime instanceof Date ? resetTime.getTime() : Number(resetTime || 0);
  return Math.max(1, Math.ceil((resetAt > Date.now() ? resetAt - Date.now() : windowMs) / 1000));
}

function createRateLimitHandler(scope, message, windowMs) {
  return (req, res) => {
    const retryAfter = retryAfterSeconds(req, windowMs);
    const traceId = req?.traceId || res?.locals?.traceId || null;
    res.setHeader("Retry-After", String(retryAfter));
    logger.warn({
      action: "RateLimitRejected",
      module: "RateLimit",
      requestId: traceId,
      status: "429",
      metadata: {
        method: req.method,
        path: requestPath(req),
        retryAfterSeconds: retryAfter,
        scope
      }
    });
    return res.status(429).json({
      ok: false,
      message,
      retryAfterSeconds: retryAfter,
      scope,
      traceId
    });
  };
}

const mediaReadRateLimit = rateLimit({
  windowMs: MEDIA_READ_WINDOW_MS,
  max: MEDIA_READ_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isMediaReadRequest(req),
  handler: createRateLimitHandler(
    "media-read",
    "Demasiadas descargas de multimedia. Intenta de nuevo en unos segundos.",
    MEDIA_READ_WINDOW_MS
  )
});

const anonymousApiRateLimit = rateLimit({
  windowMs: GENERAL_API_WINDOW_MS,
  max: GENERAL_API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "api-anonymous",
    "Demasiadas solicitudes. Intenta de nuevo mas tarde.",
    GENERAL_API_WINDOW_MS
  )
});

const authenticatedApiRateLimit = rateLimit({
  windowMs: AUTHENTICATED_API_WINDOW_MS,
  max: AUTHENTICATED_API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authenticatedApiKey,
  handler: createRateLimitHandler(
    "api-authenticated",
    "Demasiadas solicitudes de la sesión. Intenta de nuevo en unos segundos.",
    AUTHENTICATED_API_WINDOW_MS
  )
});

function generalApiRateLimit(req, res, next) {
  const scope = selectGeneralApiRateLimitScope(req);
  if (scope === "skip") return next();
  if (scope === "authenticated") return authenticatedApiRateLimit(req, res, next);
  return anonymousApiRateLimit(req, res, next);
}

module.exports = {
  AUTHENTICATED_API_MAX,
  AUTHENTICATED_API_WINDOW_MS,
  GENERAL_API_MAX,
  GENERAL_API_WINDOW_MS,
  MEDIA_READ_MAX,
  MEDIA_READ_WINDOW_MS,
  authenticatedApiKey,
  createRateLimitHandler,
  generalApiRateLimit,
  getVerifiedBearerIdentity,
  hasVerifiedBearerCredential,
  isAuthApiRequest,
  isMediaReadRequest,
  mediaReadRateLimit,
  selectGeneralApiRateLimitScope,
  shouldSkipGeneralApiRateLimit
};
