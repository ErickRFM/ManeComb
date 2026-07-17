let externalLogger = null;

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
      metadata: {
        template: data.template,
        provider: data.provider,
        to: data.to,
        priority: data.priority,
        durationMs: data.durationMs,
        error: data.error
      }
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
    metadata: {
      template: data.template,
      provider: data.provider,
      to: data.to,
      priority: data.priority,
      durationMs: data.durationMs,
      error: data.error
    }
  };
  console.log(JSON.stringify(payload));
}

function logError(action, error, metadata) {
  if (externalLogger) {
    externalLogger.error({
      action,
      module: "Communication",
      message: error?.message || String(error),
      error,
      metadata
    });
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level: "error",
    module: "Communication",
    action,
    message: error?.message || String(error),
    metadata
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
