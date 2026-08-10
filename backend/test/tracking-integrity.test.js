const assert = require("node:assert/strict");
const {
  MAX_CLIENT_QUEUE_AGE_MS,
  buildGpsFreshness,
  normalizeTrackingTime
} = require("../src/services/tracking-time");
const receivedAt = new Date("2026-07-17T12:00:00.000Z");

let decision = normalizeTrackingTime("2026-07-17T12:01:00.000Z", receivedAt);
assert.equal(decision.timestampSource, "client");
decision = normalizeTrackingTime("2026-07-17T13:00:00.000Z", receivedAt);
assert.equal(decision.timestampSource, "server");
assert.equal(decision.discardReason, "client_clock_ahead");
assert.equal(decision.clientTimestamp, "2026-07-17T13:00:00.000Z");
decision = normalizeTrackingTime("2026-07-17T10:00:00.000Z", receivedAt);
assert.equal(decision.discardReason, "client_clock_behind");
decision = normalizeTrackingTime("2026-07-17T11:59:30.000Z", receivedAt);
assert.equal(decision.timestampSource, "client");
assert.equal(decision.discardReason, null);

// A queued packet carries elapsed transport age. Server receipt stays truthful,
// while processedTimestamp represents when the position was effectively captured.
decision = normalizeTrackingTime(
  "2026-07-17T10:00:00.000Z",
  receivedAt,
  30 * 60 * 1000
);
assert.equal(decision.timestampSource, "transport_queue_age");
assert.equal(decision.receivedAt, "2026-07-17T12:00:00.000Z");
assert.equal(decision.processedTimestamp, "2026-07-17T11:30:00.000Z");
assert.equal(decision.transportCapturedAt, "2026-07-17T11:30:00.000Z");
assert.equal(decision.clientQueueAgeMs, 30 * 60 * 1000);
assert.equal(decision.discardReason, null);

// Queue age is independent from the phone wall clock: a wildly skewed device
// with an immediate upload remains an immediate capture on the server timeline.
decision = normalizeTrackingTime("2026-07-16T12:00:00.000Z", receivedAt, 0);
assert.equal(decision.timestampSource, "transport_queue_age");
assert.equal(decision.processedTimestamp, receivedAt.toISOString());
assert.equal(decision.clientQueueAgeMs, 0);

// Without an explicit elapsed queue age, legacy/skewed clients retain the
// server-receipt authority instead of trusting their wall clock.
decision = normalizeTrackingTime("2026-07-16T12:00:00.000Z", receivedAt);
assert.equal(decision.timestampSource, "server");
assert.equal(decision.processedTimestamp, receivedAt.toISOString());
assert.equal(decision.discardReason, "client_clock_behind");

// Malicious/invalid giant ages are bounded to the native queue retention policy.
decision = normalizeTrackingTime(
  "2026-07-17T11:59:59.000Z",
  receivedAt,
  MAX_CLIENT_QUEUE_AGE_MS * 10
);
assert.equal(decision.clientQueueAgeMs, MAX_CLIENT_QUEUE_AGE_MS);

assert.equal(buildGpsFreshness("2026-07-17T11:59:00.000Z", receivedAt).state, "fresh");
assert.equal(buildGpsFreshness("2026-07-17T11:57:59.999Z", receivedAt).state, "stale");
assert.equal(buildGpsFreshness(null, receivedAt).state, "missing");
console.log("tracking integrity tests passed");