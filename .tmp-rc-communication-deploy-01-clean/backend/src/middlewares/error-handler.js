const { recordAppEventSafely, sendSentryErrorEvent } = require("../services/telemetry");
const { IS_PRODUCTION_RUNTIME } = require("../config/env");
const { classifyError } = require("../services/error-classification");
const logger = require("../services/logger");

function getHttpStatus(error) {
  const statusCode = Number(error?.statusCode || error?.status || 500);

  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
    return statusCode;
  }

  return 500;
}

function getPublicErrorMessage(error, statusCode) {
  const fallbackMessage = "Error interno del servidor";

  if (IS_PRODUCTION_RUNTIME && statusCode >= 500) {
    return fallbackMessage;
  }

  return error?.message || fallbackMessage;
}

function errorHandler(error, req, res, next) {
  const traceId = req?.traceId || res?.locals?.traceId || null;
  const statusCode = getHttpStatus(error);
  const category = classifyError(error);
  logger.error({
    action: "UnhandledError",
    error,
    metadata: {
      category,
      method: req?.method || "",
      path: req?.path || "",
      statusCode
    },
    module: "API",
    organizationId: req?.user?.organizationId,
    requestId: traceId,
    status: String(statusCode),
    userId: req?.user?.id
  });
  recordAppEventSafely(req?.app?.locals?.store, {
    type: "api_exception",
    scope: "api",
    level: "critical",
    status: String(statusCode),
    route: req?.originalUrl || req?.path || "",
    method: req?.method || "",
    userId: req?.user?.id,
    message: error.message || "Error interno del servidor",
    metadata: {
      category,
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

  return res.status(statusCode).json({
    ok: false,
    message: getPublicErrorMessage(error, statusCode),
    traceId
  });
}

module.exports = {
  errorHandler,
  getPublicErrorMessage
};
