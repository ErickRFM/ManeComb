const assert = require("node:assert/strict");
const {
  GPS_FRESH_MAX_AGE_SECONDS,
  GPS_LIVE_MAX_AGE_SECONDS,
  GPS_STALE_MAX_AGE_SECONDS,
  buildOperationalUnitSnapshot
} = require("../src/domain/operational-unit-snapshot");

const NOW = new Date("2026-08-10T07:30:00.000Z");

function vehicleAt(secondsAgo, overrides = {}) {
  const timestamp = new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
  return {
    id: "vehicle-1",
    code: "C-1",
    status: "on-route",
    assignedRoute: { routeId: "route-1", routeName: "Ruta Centro" },
    location: { latitude: 19.3139, longitude: -98.2404 },
    locationTimestamp: timestamp,
    locationReceivedAt: timestamp,
    speed: 8,
    ...overrides
  };
}

assert.equal(GPS_LIVE_MAX_AGE_SECONDS, 15);
assert.equal(GPS_FRESH_MAX_AGE_SECONDS, 30);
assert.equal(GPS_STALE_MAX_AGE_SECONDS, 90);

const live = buildOperationalUnitSnapshot({ vehicle: vehicleAt(15), now: NOW });
assert.equal(live.gps.connectionState, "live");
assert.equal(live.gps.freshness, "fresh");
assert.equal(live.gps.ageSeconds, 15);

const delayed = buildOperationalUnitSnapshot({ vehicle: vehicleAt(16), now: NOW });
assert.equal(delayed.gps.connectionState, "delayed");
assert.equal(delayed.gps.freshness, "fresh");

const delayedBoundary = buildOperationalUnitSnapshot({ vehicle: vehicleAt(30), now: NOW });
assert.equal(delayedBoundary.gps.connectionState, "delayed");
assert.equal(delayedBoundary.gps.freshness, "fresh");

const stale = buildOperationalUnitSnapshot({ vehicle: vehicleAt(31), now: NOW });
assert.equal(stale.gps.connectionState, "stale");
assert.equal(stale.gps.freshness, "stale");
assert.equal(stale.operationalState, "unknown");

const staleBoundary = buildOperationalUnitSnapshot({ vehicle: vehicleAt(90), now: NOW });
assert.equal(staleBoundary.gps.connectionState, "stale");
assert.equal(staleBoundary.gps.freshness, "stale");

const lost = buildOperationalUnitSnapshot({ vehicle: vehicleAt(91), now: NOW });
assert.equal(lost.gps.connectionState, "lost");
assert.equal(lost.gps.freshness, "missing");
assert.equal(lost.gps.lat, 19.3139, "la ultima posicion conocida nunca desaparece");

// El reloj del servidor manda para estado vivo. Un telefono cinco minutos atrasado
// no puede hacer que una posicion recibida hace cinco segundos parezca perdida.
const skewedPhoneClock = buildOperationalUnitSnapshot({
  vehicle: vehicleAt(300, {
    locationReceivedAt: new Date(NOW.getTime() - 5_000).toISOString()
  }),
  now: NOW
});
assert.equal(skewedPhoneClock.gps.ageSeconds, 5);
assert.equal(skewedPhoneClock.gps.connectionState, "live");
assert.equal(skewedPhoneClock.gps.freshness, "fresh");
assert.notEqual(skewedPhoneClock.gps.recordedAt, skewedPhoneClock.gps.receivedAt);

// Compatibilidad con registros previos a locationReceivedAt.
const legacy = buildOperationalUnitSnapshot({
  vehicle: vehicleAt(20, { locationReceivedAt: undefined }),
  now: NOW
});
assert.equal(legacy.gps.ageSeconds, 20);
assert.equal(legacy.gps.connectionState, "delayed");
assert.equal(legacy.gps.freshness, "fresh");

console.log("ok - GPS freshness usa receive-time y transicion rapida live/delayed/stale/lost");
