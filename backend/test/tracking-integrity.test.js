const assert = require("node:assert/strict");
const { buildGpsFreshness, normalizeTrackingTime } = require("../src/services/tracking-time");
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
assert.equal(buildGpsFreshness("2026-07-17T11:59:00.000Z", receivedAt).state, "fresh");
assert.equal(buildGpsFreshness("2026-07-17T11:57:59.999Z", receivedAt).state, "stale");
assert.equal(buildGpsFreshness(null, receivedAt).state, "missing");
console.log("tracking integrity tests passed");
