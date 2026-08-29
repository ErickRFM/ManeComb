const config = require("../config");
const queue = require("../queue");
const metrics = require("../metrics");
const connectionManager = require("../connection");
const history = require("../history");

let providerReady = false;
let outboxRecoveryReady = false;
let lastOperationalError = null;

function setProviderReady(value) {
  providerReady = Boolean(value);
}

function setOutboxRecoveryReady(value) {
  outboxRecoveryReady = Boolean(value);
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
  // Redis persistence remains a valid durability mechanism. When it is absent,
  // Mongo outbox may replace it only after the runtime actually started the
  // recovery reaper; code presence alone must never make readiness green.
  const productionDurability = historyState.durable && (
    !queueState.enabled || queueState.durableAcrossRestart || outboxRecoveryReady
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
    outboxRecovery: outboxRecoveryReady,
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
  setOutboxRecoveryReady,
  setLastOperationalError
};
