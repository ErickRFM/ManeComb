let externalLogger = null;
const { safeDeliveryLog, sanitizeProviderError } = require("../security");

function setLogger(logger) {
  externalLogger = logger;
}

function logEvent(action, data) {
  if (externalLogger) {
    externalLogger.info({
      action,
      module: "Communication",
      message: data.message || "",
      status: data.status || "unknown",
      metadata: safeDeliveryLog(data)
    });
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level: "info",
    module: "Communication",
    action,
    message: data.message || "",
    status: data.status || "unknown",
    metadata: safeDeliveryLog(data)
  };
  console.log(JSON.stringify(payload));
}

function logError(action, error, metadata) {
  if (externalLogger) {
    externalLogger.error({
      action,
      module: "Communication",
      message: sanitizeProviderError(error),
      metadata: safeDeliveryLog({ ...metadata, error })
    });
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level: "error",
    module: "Communication",
    action,
    message: sanitizeProviderError(error),
    metadata: safeDeliveryLog({ ...metadata, error })
  };
  console.error(JSON.stringify(payload));
}

function logWarn(action, message, metadata) {
  if (externalLogger) {
    externalLogger.warn({
      action,
      module: "Communication",
      message,
      metadata
    });
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level: "warn",
    module: "Communication",
    action,
    message,
    metadata
  };
  console.warn(JSON.stringify(payload));
}

module.exports = {
  setLogger,
  logEvent,
  logError,
  logWarn
};
