const { recordAppEventSafely, sendSentryErrorEvent } = require("../services/telemetry");

function errorHandler(error, req, res, next) {
  console.error("[api:error]", error);

  const traceId = req?.traceId || res?.locals?.traceId || null;
  recordAppEventSafely(req?.app?.locals?.store, {
    type: "api_exception",
    scope: "api",
    level: "critical",
    status: String(error.statusCode || 500),
    route: req?.originalUrl || req?.path || "",
    method: req?.method || "",
    userId: req?.user?.id,
    message: error.message || "Error interno del servidor",
    metadata: {
      traceId,
      stack: error.stack || ""
    }
  });
  void sendSentryErrorEvent({
    level: "error",
    message: error.message || "Error interno del servidor",
    tags: {
      traceId: traceId || "",
      method: req?.method || "",
      route: req?.path || ""
    },
    request: req
      ? {
          url: req.originalUrl,
          method: req.method,
          headers: {
            "user-agent": req.headers["user-agent"] || "",
            "x-trace-id": traceId || ""
          }
        }
      : undefined,
    extra: {
      stack: error.stack || ""
    }
  }).catch(() => undefined);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(error.statusCode || 500).json({
    ok: false,
    message: error.message || "Error interno del servidor",
    traceId
  });
}

module.exports = {
  errorHandler
};
