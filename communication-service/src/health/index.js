const config = require("../config");
const queue = require("../queue");
const metrics = require("../metrics");
const { PROVIDER } = require("../core/types");

function getReadiness() {
  return {
    configured: config.isConfigured(),
    provider: config.getConfig().providerName,
    ready: config.isConfigured() && config.getConfig().providerName !== null,
    queue: queue.getReadiness(),
    metrics: metrics.getSnapshot()
  };
}

module.exports = {
  getReadiness
};
