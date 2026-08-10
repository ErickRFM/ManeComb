const rateLimit = require("express-rate-limit");
const logger = require("../services/logger");
const { verifyToken } = require("../utils/jwt");

const GENERAL_API_WINDOW_MS = 15 * 60 * 1000;
const GENERAL_API_MAX = 200;
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

function hasVerifiedBearerCredential(req) {
  const authorization = String(req?.headers?.authorization || "").trim();
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return false;
  try {
    return Boolean(verifyToken(match[1])?.sub);
  } catch {
    return false;
  }
}

function shouldSkipGeneralApiRateLimit(req) {
  // Auth owns its abuse budgets at the route (login/register, refresh and
  // password recovery). Authenticated operational traffic is governed by its
  // token and route authorization, not by the anonymous perimeter bucket.
  return isMediaReadRequest(req) || isAuthApiRequest(req) || hasVerifiedBearerCredential(req);
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

const generalApiRateLimit = rateLimit({
  windowMs: GENERAL_API_WINDOW_MS,
  max: GENERAL_API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Audio/video autenticado tiene una cuota propia. Contarlo también aquí hacía
  // que una sesión operativa sana agotara el presupuesto genérico y devolviera
  // 429 justo al reproducir una transmisión nueva de Radio.
  skip: shouldSkipGeneralApiRateLimit,
  handler: createRateLimitHandler(
    "api-anonymous",
    "Demasiadas solicitudes. Intenta de nuevo mas tarde.",
    GENERAL_API_WINDOW_MS
  )
});

module.exports = {
  GENERAL_API_MAX,
  GENERAL_API_WINDOW_MS,
  MEDIA_READ_MAX,
  MEDIA_READ_WINDOW_MS,
  createRateLimitHandler,
  generalApiRateLimit,
  hasVerifiedBearerCredential,
  isAuthApiRequest,
  isMediaReadRequest,
  mediaReadRateLimit,
  shouldSkipGeneralApiRateLimit
};
