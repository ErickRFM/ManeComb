const unifiedMetrics = require("../../../communication-service/src/metrics");

function incrementMetric(name, value = 1, tags = {}) {
  unifiedMetrics.increment(name, value, tags);
}

function observeDuration(name, durationMs, tags = {}) {
  unifiedMetrics.observeDuration(name, durationMs, tags);
}

function setGauge(name, value, tags = {}) {
  unifiedMetrics.setGauge(name, value, tags);
}

function getMetricsSnapshot() {
  return unifiedMetrics.getSnapshot();
}

function resetMetrics() {
  unifiedMetrics.reset();
}

module.exports = {
  getMetricsSnapshot,
  incrementMetric,
  observeDuration,
  resetMetrics,
  setGauge
};
