const rateLimit = require("express-rate-limit");

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

const mediaReadRateLimit = rateLimit({
  windowMs: MEDIA_READ_WINDOW_MS,
  max: MEDIA_READ_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isMediaReadRequest(req),
  message: {
    ok: false,
    message: "Demasiadas descargas de multimedia. Intenta de nuevo en unos segundos."
  }
});

const generalApiRateLimit = rateLimit({
  windowMs: GENERAL_API_WINDOW_MS,
  max: GENERAL_API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Audio/video autenticado tiene una cuota propia. Contarlo también aquí hacía
  // que una sesión operativa sana agotara el presupuesto genérico y devolviera
  // 429 justo al reproducir una transmisión nueva de Radio.
  skip: isMediaReadRequest
});

module.exports = {
  GENERAL_API_MAX,
  GENERAL_API_WINDOW_MS,
  MEDIA_READ_MAX,
  MEDIA_READ_WINDOW_MS,
  generalApiRateLimit,
  isMediaReadRequest,
  mediaReadRateLimit
};
