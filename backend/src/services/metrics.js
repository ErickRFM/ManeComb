const counters = new Map();
const timers = new Map();
const gauges = new Map();

function incrementMetric(name, value = 1, tags = {}) {
  const key = getMetricKey(name, tags);
  counters.set(key, {
    name,
    tags,
    value: (counters.get(key)?.value || 0) + value
  });
}

function observeDuration(name, durationMs, tags = {}) {
  const key = getMetricKey(name, tags);
  const current = timers.get(key) || {
    count: 0,
    maxMs: 0,
    name,
    tags,
    totalMs: 0
  };
  current.count += 1;
  current.totalMs += Math.max(0, Number(durationMs) || 0);
  current.maxMs = Math.max(current.maxMs, Math.max(0, Number(durationMs) || 0));
  timers.set(key, current);
}

function setGauge(name, value, tags = {}) {
  gauges.set(getMetricKey(name, tags), {
    name,
    tags,
    value
  });
}

function getMetricKey(name, tags = {}) {
  const tagKey = Object.keys(tags)
    .sort()
    .map((key) => `${key}:${tags[key]}`)
    .join("|");
  return `${name}${tagKey ? `{${tagKey}}` : ""}`;
}

function listMapEntries(map, mapper = (entry) => entry) {
  return Array.from(map.values()).map(mapper);
}

function getMetricsSnapshot() {
  return {
    counters: listMapEntries(counters),
    gauges: listMapEntries(gauges),
    timers: listMapEntries(timers, (timer) => ({
      ...timer,
      averageMs: timer.count ? Math.round(timer.totalMs / timer.count) : 0
    })),
    timestamp: new Date().toISOString()
  };
}

function resetMetrics() {
  counters.clear();
  timers.clear();
  gauges.clear();
}

module.exports = {
  getMetricsSnapshot,
  incrementMetric,
  observeDuration,
  resetMetrics,
  setGauge
};
