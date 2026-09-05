const { IS_PRODUCTION_RUNTIME } = require("../config/env");
const logger = require("../services/logger");

const TRUSTED_PRODUCTION_BROWSER_ORIGINS = new Set([
  "https://manecomb.com",
  "https://www.manecomb.com",
  "https://admin.manecomb.com",
  // Cloudflare Pages sigue siendo la superficie productiva desplegada mientras
  // termina la migración al dominio canónico. Se autoriza únicamente el host
  // exacto del proyecto; previews aleatorios (*.pages.dev) continúan bloqueados.
  "https://manecomb1.pages.dev"
]);

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function isTrustedProductionBrowserOrigin(value) {
  const origin = normalizeOrigin(value);
  return Boolean(origin && TRUSTED_PRODUCTION_BROWSER_ORIGINS.has(origin));
}

// Render owns this exact public HTTPS URL. Read it once at startup; never derive
// trust from request Host/Origin, a wildcard, or a caller-supplied fallback.
const REALTIME_SELF_ORIGIN = normalizeOrigin(process.env.RENDER_EXTERNAL_URL);

function isTrustedRealtimeSelfOrigin(value) {
  return Boolean(
    REALTIME_SELF_ORIGIN &&
    !REALTIME_SELF_ORIGIN.includes("*") &&
    value === REALTIME_SELF_ORIGIN
  );
}

function getRejectedOriginMetadata(req, transport) {
  const rawOrigin = String(req?.headers?.origin || "").trim();
  return {
    method: req?.method || null,
    origin: normalizeOrigin(rawOrigin) || "invalid",
    path: req?.url || req?.path || null,
    transport
  };
}

function productionOriginGuard(req, res, next) {
  if (!IS_PRODUCTION_RUNTIME) return next();

  // Native HTTP and server-to-server clients may omit browser Origin. Android's
  // WebSocket default Origin is handled separately at the realtime boundary.
  // CORS is not an authentication boundary, but rejecting unexpected browser
  // origins removes unknown previews, localhost and sandbox surfaces from Production.
  const rawOrigin = String(req.headers.origin || "").trim();
  if (!rawOrigin) return next();
  if (isTrustedProductionBrowserOrigin(rawOrigin)) return next();

  logger.warn({
    action: "ProductionOriginRejected",
    module: "Security",
    status: "403",
    requestId: req.traceId || null,
    metadata: getRejectedOriginMetadata(req, "http")
  });

  return res.status(403).json({
    ok: false,
    code: "ORIGIN_NOT_ALLOWED",
    message: "Origen no permitido"
  });
}

function productionRealtimeOriginGuard(req, res, next) {
  if (!IS_PRODUCTION_RUNTIME) return next();

  const rawOrigin = String(req?.headers?.origin || "").trim();
  // React Native Android adds the WebSocket endpoint's HTTPS Origin, unlike
  // the Java Radio client. This exception must not expand normal HTTP CORS.
  if (!rawOrigin || isTrustedProductionBrowserOrigin(rawOrigin) || isTrustedRealtimeSelfOrigin(rawOrigin)) return next();

  logger.warn({
    action: "ProductionRealtimeOriginRejected",
    module: "Security",
    status: "rejected",
    metadata: getRejectedOriginMetadata(req, "socket.io")
  });

  // Engine.IO middleware errors terminate the handshake before Socket.IO auth.
  // An accepted Origin still has to pass the existing Socket.IO token auth.
  const error = new Error("Origen no permitido");
  error.data = { code: "ORIGIN_NOT_ALLOWED" };
  return next(error);
}

module.exports = {
  TRUSTED_PRODUCTION_BROWSER_ORIGINS,
  isTrustedProductionBrowserOrigin,
  normalizeOrigin,
  productionOriginGuard,
  productionRealtimeOriginGuard
};
