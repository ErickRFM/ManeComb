const logger = require("../../src/services/logger");

function logEvent(action, data) {
  logger.info({
    action,
    module: "Communication",
    message: data.message || "",
    status: data.status || "unknown",
    metadata: {
      template: data.template,
      provider: data.provider,
      to: data.to,
      priority: data.priority,
      durationMs: data.durationMs,
      error: data.error
    }
  });
}

function logError(action, error, metadata) {
  logger.error({
    action,
    module: "Communication",
    message: error?.message || String(error),
    error,
    metadata
  });
}

function logWarn(action, message, metadata) {
  logger.warn({
    action,
    module: "Communication",
    message,
    metadata
  });
}

module.exports = {
  logEvent,
  logError,
  logWarn
};
