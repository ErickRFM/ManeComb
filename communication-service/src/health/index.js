const config = require("../config");
const queue = require("../queue");
const metrics = require("../metrics");
const connectionManager = require("../connection");
const history = require("../history");

let providerReady = false;
let lastOperationalError = null;

function setProviderReady(value) {
  providerReady = Boolean(value);
}

function setLastOperationalError(error) {
  lastOperationalError = error
    ? {
        category: error.category || "unknown",
        code: error.code || null,
        message: String(error.message || "email_operation_failed").slice(0, 160),
        at: new Date().toISOString()
      }
    : null;
}

function getReadiness() {
  const cfg = config.getConfig();
  const queueState = queue.getReadiness();
  const historyState = history.getReadiness();
  const queueFunctional = !queueState.enabled || queueState.functional;
  const functional = cfg.email.enabled && (
    cfg.email.dryRun
      ? historyState.durable
      : providerReady && historyState.durable && queueFunctional
  );
  // Mongo now owns executable pending work. Redis persistence remains useful,
  // but is no longer required for end-to-end durability because BullMQ can be
  // reconstructed from the durable outbox using deterministic job IDs.
  const mongoOutboxRecovery = Boolean(historyState.durable);
  const productionDurability = historyState.durable && (
    !queueState.enabled || queueState.durableAcrossRestart || mongoOutboxRecovery
  );
  let status = "ready";
  if (!cfg.email.enabled) status = "disabled";
  else if (cfg.email.dryRun) status = "dry_run";
  else if (!providerReady) status = "error";
  else if (!functional || !productionDurability) status = "degraded";
  return {
    configured: config.isConfigured() && providerReady,
    providerConfigured: providerReady,
    provider: cfg.provider,
    status,
    ready: status === "ready",
    functional,
    productionDurability,
    durable: productionDurability,
    outboxRecovery: mongoOutboxRecovery,
    queue: queueState,
    history: historyState,
    lastError: lastOperationalError,
    connections: connectionManager.getHealth(),
    metrics: metrics.getSnapshot(),
    timestamp: new Date().toISOString()
  };
}

function getLiveness() {
  return {
    status: "alive",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  getReadiness,
  getLiveness,
  setProviderReady,
  setLastOperationalError
};
