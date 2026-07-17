const config = require("../config");
const queue = require("../queue");
const metrics = require("../metrics");
const connectionManager = require("../connection");

function getReadiness() {
  return {
    configured: config.isConfigured(),
    provider: config.getConfig().provider,
    ready: config.isConfigured() && config.getConfig().provider !== null,
    queue: queue.getReadiness(),
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
  getLiveness
};
