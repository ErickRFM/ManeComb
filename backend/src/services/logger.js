const { LOG_LEVEL, NODE_ENV, RUNTIME_COMMIT } = require("../config/env");

const LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function normalizeLevel(level) {
  return LEVEL_WEIGHT[level] ? level : "info";
}

function shouldLog(level) {
  return LEVEL_WEIGHT[normalizeLevel(level)] >= LEVEL_WEIGHT[normalizeLevel(LOG_LEVEL)];
}

function serializeError(error) {
  if (!error) {
    return undefined;
  }

  return {
    message: error.message || String(error),
    name: error.name || "Error",
    stack: error.stack || ""
  };
}

function log(level, event) {
  const safeLevel = normalizeLevel(level);

  if (!shouldLog(safeLevel)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level: safeLevel,
    environment: NODE_ENV,
    commit: RUNTIME_COMMIT || null,
    module: event.module || "Backend",
    action: event.action || "Event",
    requestId: event.requestId || event.traceId || null,
    userId: event.userId || null,
    organizationId: event.organizationId || null,
    durationMs: typeof event.durationMs === "number" ? event.durationMs : null,
    status: event.status || "unknown",
    message: event.message || "",
    metadata: event.metadata || undefined,
    error: serializeError(event.error)
  };

  const line = JSON.stringify(payload);

  if (safeLevel === "error") {
    console.error(line);
    return;
  }

  if (safeLevel === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

module.exports = {
  debug: (event) => log("debug", event),
  info: (event) => log("info", event),
  warn: (event) => log("warn", event),
  error: (event) => log("error", event),
  log
};
