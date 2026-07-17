const assert = require("node:assert/strict");
const { resolveIncidentLocation } = require("../src/services/incident-location");

const now = new Date("2026-07-17T12:00:00.000Z");
const point = { latitude: 19.43, longitude: -99.13, timestamp: "2026-07-17T11:59:00.000Z" };

let result = resolveIncidentLocation({ location: point, locationTimestamp: point.timestamp }, point, now);
assert.equal(result.locationState, "fresh");
assert.equal(result.location.latitude, point.latitude);
assert.equal(result.location.longitude, point.longitude);
assert.equal(result.location.timestamp, point.timestamp);

result = resolveIncidentLocation({ location: point, locationTimestamp: "2026-07-17T11:50:00.000Z" }, point, now);
assert.equal(result.locationState, "stale");
assert.equal(result.location, null);
assert.equal(result.locationSourceTimestamp, "2026-07-17T11:50:00.000Z");

result = resolveIncidentLocation({ locationTimestamp: null }, null, now);
assert.equal(result.locationState, "missing");
assert.equal(result.location, null);

console.log("incident location tests passed");
