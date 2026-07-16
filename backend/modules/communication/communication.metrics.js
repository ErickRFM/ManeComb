const counters = {};
const timers = {};

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

function observeDuration(name, durationMs, tags = {}) {
  const key = makeKey(name, tags);
  if (!timers[key]) {
    timers[key] = { name, tags, count: 0, totalMs: 0, maxMs: 0 };
  }
  timers[key].count += 1;
  timers[key].totalMs += Math.max(0, Number(durationMs) || 0);
  timers[key].maxMs = Math.max(timers[key].maxMs, Math.max(0, Number(durationMs) || 0));
}

function getSnapshot() {
  return {
    counters: Object.values(counters).map((c) => ({ ...c })),
    timers: Object.values(timers).map((t) => ({
      ...t,
      averageMs: t.count ? Math.round(t.totalMs / t.count) : 0
    })),
    timestamp: new Date().toISOString()
  };
}

function reset() {
  Object.keys(counters).forEach((k) => delete counters[k]);
  Object.keys(timers).forEach((k) => delete timers[k]);
}

module.exports = {
  increment,
  observeDuration,
  getSnapshot,
  reset
};
