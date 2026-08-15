const counters = {};
const timers = {};
const gauges = {};
// Constant-memory cumulative histogram. Percentiles are approximate bucket
// upper bounds over the process lifetime since the last reset, not exact
// sample percentiles and not a sliding window.
const DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, Infinity];

function makeKey(name, tags = {}) {
  const tagStr = Object.keys(tags)
    .sort()
    .map((k) => `${k}:${tags[k]}`)
    .join("|");
  return `${name}${tagStr ? `{${tagStr}}` : ""}`;
}

function increment(name, value = 1, tags = {}) {
  const key = makeKey(name, tags);
  if (!counters[key]) {
    counters[key] = { name, tags, value: 0 };
  }
  counters[key].value += value;
}

function incrementMetric(name, value = 1, tags = {}) {
  increment(name, value, tags);
}

function observeDuration(name, durationMs, tags = {}) {
  const key = makeKey(name, tags);
  if (!timers[key]) {
    timers[key] = {
      name,
      tags,
      count: 0,
      totalMs: 0,
      maxMs: 0,
      buckets: DURATION_BUCKETS_MS.map((upperBoundMs) => ({ upperBoundMs, count: 0 }))
    };
  }
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  timers[key].count += 1;
  timers[key].totalMs += safeDurationMs;
  timers[key].maxMs = Math.max(timers[key].maxMs, safeDurationMs);
  const bucket = timers[key].buckets.find((entry) => safeDurationMs <= entry.upperBoundMs);
  if (bucket) bucket.count += 1;
}

function approximatePercentile(timer, percentile) {
  const target = Math.max(1, Math.ceil(timer.count * percentile));
  let cumulative = 0;
  for (const bucket of timer.buckets) {
    cumulative += bucket.count;
    if (cumulative >= target) {
      return Number.isFinite(bucket.upperBoundMs) ? bucket.upperBoundMs : timer.maxMs;
    }
  }
  return timer.maxMs;
}

function setGauge(name, value, tags = {}) {
  const key = makeKey(name, tags);
  gauges[key] = { name, tags, value };
}

function getSnapshot() {
  return {
    counters: Object.values(counters).map((c) => ({ ...c })),
    timers: Object.values(timers).map((t) => ({
      ...t,
      averageMs: t.count ? Math.round(t.totalMs / t.count) : 0,
      percentileMethod: "approximate_bucket_upper_bound_process_lifetime",
      p50ApproxMs: approximatePercentile(t, 0.50),
      p95ApproxMs: approximatePercentile(t, 0.95),
      p99ApproxMs: approximatePercentile(t, 0.99),
      buckets: t.buckets.map((bucket) => ({
        upperBoundMs: Number.isFinite(bucket.upperBoundMs) ? bucket.upperBoundMs : null,
        count: bucket.count
      }))
    })),
    gauges: Object.values(gauges).map((g) => ({ ...g })),
    timestamp: new Date().toISOString()
  };
}

function getMetricsSnapshot() {
  return getSnapshot();
}

function reset() {
  Object.keys(counters).forEach((k) => delete counters[k]);
  Object.keys(timers).forEach((k) => delete timers[k]);
  Object.keys(gauges).forEach((k) => delete gauges[k]);
}

function resetMetrics() {
  reset();
}

module.exports = {
  increment,
  incrementMetric,
  observeDuration,
  setGauge,
  getSnapshot,
  getMetricsSnapshot,
  reset,
  resetMetrics
};
