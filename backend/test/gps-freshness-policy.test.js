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

assert.equal(GPS_LIVE_MAX_AGE_SECONDS, 8);
assert.equal(GPS_FRESH_MAX_AGE_SECONDS, 15);
assert.equal(GPS_STALE_MAX_AGE_SECONDS, 30);

const live = buildOperationalUnitSnapshot({ vehicle: vehicleAt(8), now: NOW });
assert.equal(live.gps.connectionState, "live");
assert.equal(live.gps.freshness, "fresh");
assert.equal(live.gps.ageSeconds, 8);
assert.equal(live.operationalState, "on_route");

const delayed = buildOperationalUnitSnapshot({ vehicle: vehicleAt(9), now: NOW });
assert.equal(delayed.gps.connectionState, "delayed");
assert.equal(delayed.gps.freshness, "fresh");
assert.equal(
  delayed.operationalState,
  "unknown",
  "un heartbeat vencido no puede seguir afirmando que la unidad esta en ruta o detenida"
);

const delayedBoundary = buildOperationalUnitSnapshot({ vehicle: vehicleAt(15), now: NOW });
assert.equal(delayedBoundary.gps.connectionState, "delayed");
assert.equal(delayedBoundary.gps.freshness, "fresh");
assert.equal(delayedBoundary.operationalState, "unknown");

const stale = buildOperationalUnitSnapshot({ vehicle: vehicleAt(16), now: NOW });
assert.equal(stale.gps.connectionState, "stale");
assert.equal(stale.gps.freshness, "stale");
assert.equal(stale.operationalState, "unknown");

const staleBoundary = buildOperationalUnitSnapshot({ vehicle: vehicleAt(30), now: NOW });
assert.equal(staleBoundary.gps.connectionState, "stale");
assert.equal(staleBoundary.gps.freshness, "stale");

const lost = buildOperationalUnitSnapshot({ vehicle: vehicleAt(31), now: NOW });
assert.equal(lost.gps.connectionState, "lost");
assert.equal(lost.gps.freshness, "missing");
assert.equal(lost.gps.lat, 19.3139, "la ultima posicion conocida nunca desaparece");

// El reloj del servidor manda para estado vivo. Un telefono cinco minutos atrasado
// no puede hacer que una posicion recibida hace cinco segundos parezca perdida.
const skewedPhoneClock = buildOperationalUnitSnapshot({
  vehicle: vehicleAt(300, {
    locationReceivedAt: new Date(NOW.getTime() - 5_000).toISOString(),
    locationTimestampSource: "server"
  }),
  now: NOW
});
assert.equal(skewedPhoneClock.gps.ageSeconds, 5);
assert.equal(skewedPhoneClock.gps.connectionState, "live");
assert.equal(skewedPhoneClock.gps.freshness, "fresh");
assert.notEqual(skewedPhoneClock.gps.recordedAt, skewedPhoneClock.gps.receivedAt);

// Un punto que estuvo 30 minutos en la cola puede llegar al servidor AHORA,
// pero no se convierte en una posicion viva. `transport_queue_age` afirma que
// locationTimestamp ya esta reconstruido con el reloj del servidor.
const queuedBacklog = buildOperationalUnitSnapshot({
  vehicle: vehicleAt(30 * 60, {
    locationReceivedAt: NOW.toISOString(),
    locationTimestampSource: "transport_queue_age"
  }),
  now: NOW
});
assert.equal(queuedBacklog.gps.ageSeconds, 30 * 60);
assert.equal(queuedBacklog.gps.connectionState, "lost");
assert.equal(queuedBacklog.gps.freshness, "missing");
assert.equal(queuedBacklog.gps.receivedAt, NOW.toISOString());
assert.notEqual(queuedBacklog.gps.recordedAt, queuedBacklog.gps.receivedAt);

// La misma autoridad permite que una captura inmediata de la cola sea live.
const queuedImmediate = buildOperationalUnitSnapshot({
  vehicle: vehicleAt(0, {
    locationReceivedAt: NOW.toISOString(),
    locationTimestampSource: "transport_queue_age"
  }),
  now: NOW
});
assert.equal(queuedImmediate.gps.connectionState, "live");
assert.equal(queuedImmediate.gps.freshness, "fresh");

// Compatibilidad con registros previos a locationReceivedAt.
const legacy = buildOperationalUnitSnapshot({
  vehicle: vehicleAt(12, { locationReceivedAt: undefined }),
  now: NOW
});
assert.equal(legacy.gps.ageSeconds, 12);
assert.equal(legacy.gps.connectionState, "delayed");
assert.equal(legacy.gps.freshness, "fresh");
assert.equal(legacy.operationalState, "unknown");

console.log("ok - GPS freshness aplica lease rapido y no presenta datos retrasados como operacion activa");