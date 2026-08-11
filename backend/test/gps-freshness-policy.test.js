const assert = require("node:assert/strict");
const {
  GPS_FRESH_MAX_AGE_SECONDS,
  GPS_LIVE_MAX_AGE_SECONDS,
  GPS_STALE_MAX_AGE_SECONDS,
  buildOperationalUnitSnapshot
} = require("../src/domain/operational-unit-snapshot");
const { getNextGpsFreshnessDeadline } = require("../src/services/operational-units-service");

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

const liveVehicle = vehicleAt(8);
const live = buildOperationalUnitSnapshot({ vehicle: liveVehicle, now: NOW });
assert.equal(live.gps.connectionState, "live");
assert.equal(live.gps.freshness, "fresh");
assert.equal(live.gps.ageSeconds, 8);
assert.equal(live.operationalState, "on_route");
assert.equal(
  getNextGpsFreshnessDeadline(liveVehicle, live).toISOString(),
  "2026-08-10T07:30:01.000Z",
  "el timer despierta al cruzar el lease live, sin polling global"
);

const delayedVehicle = vehicleAt(9);
const delayed = buildOperationalUnitSnapshot({ vehicle: delayedVehicle, now: NOW });
assert.equal(delayed.gps.connectionState, "delayed");
assert.equal(delayed.gps.freshness, "fresh");
assert.equal(
  delayed.operationalState,
  "unknown",
  "un heartbeat vencido no puede seguir afirmando que la unidad esta en ruta o detenida"
);
assert.equal(
  getNextGpsFreshnessDeadline(delayedVehicle, delayed).toISOString(),
  "2026-08-10T07:30:07.000Z"
);

const delayedBoundary = buildOperationalUnitSnapshot({ vehicle: vehicleAt(15), now: NOW });
assert.equal(delayedBoundary.gps.connectionState, "delayed");
assert.equal(delayedBoundary.gps.freshness, "fresh");
assert.equal(delayedBoundary.operationalState, "unknown");

const staleVehicle = vehicleAt(16);
const stale = buildOperationalUnitSnapshot({ vehicle: staleVehicle, now: NOW });
assert.equal(stale.gps.connectionState, "stale");
assert.equal(stale.gps.freshness, "stale");
assert.equal(stale.operationalState, "unknown");
assert.equal(
  getNextGpsFreshnessDeadline(staleVehicle, stale).toISOString(),
  "2026-08-10T07:30:15.000Z"
);

const staleBoundary = buildOperationalUnitSnapshot({ vehicle: vehicleAt(30), now: NOW });
assert.equal(staleBoundary.gps.connectionState, "stale");
assert.equal(staleBoundary.gps.freshness, "stale");

const lostVehicle = vehicleAt(31);
const lost = buildOperationalUnitSnapshot({ vehicle: lostVehicle, now: NOW });
assert.equal(lost.gps.connectionState, "lost");
assert.equal(lost.gps.freshness, "missing");
assert.equal(lost.gps.lat, 19.3139, "la ultima posicion conocida nunca desaparece");
assert.equal(getNextGpsFreshnessDeadline(lostVehicle, lost), null, "lost no deja timers vivos");

// El reloj del servidor manda para estado vivo. Un telefono cinco minutos atrasado
// no puede hacer que una posicion recibida hace cinco segundos parezca perdida.
const skewedVehicle = vehicleAt(300, {
  locationReceivedAt: new Date(NOW.getTime() - 5_000).toISOString(),
  locationTimestampSource: "server"
});
const skewedPhoneClock = buildOperationalUnitSnapshot({
  vehicle: skewedVehicle,
  now: NOW
});
assert.equal(skewedPhoneClock.gps.ageSeconds, 5);
assert.equal(skewedPhoneClock.gps.connectionState, "live");
assert.equal(skewedPhoneClock.gps.freshness, "fresh");
assert.notEqual(skewedPhoneClock.gps.recordedAt, skewedPhoneClock.gps.receivedAt);
assert.equal(
  getNextGpsFreshnessDeadline(skewedVehicle, skewedPhoneClock).toISOString(),
  "2026-08-10T07:30:04.000Z",
  "el deadline usa la recepcion servidor cuando el reloj del telefono no es autoridad"
);

// Un punto que estuvo 30 minutos en la cola puede llegar al servidor AHORA,
// pero no se convierte en una posicion viva. `transport_queue_age` afirma que
// locationTimestamp ya esta reconstruido con el reloj del servidor.
const queuedVehicle = vehicleAt(30 * 60, {
  locationReceivedAt: NOW.toISOString(),
  locationTimestampSource: "transport_queue_age"
});
const queuedBacklog = buildOperationalUnitSnapshot({
  vehicle: queuedVehicle,
  now: NOW
});
assert.equal(queuedBacklog.gps.ageSeconds, 30 * 60);
assert.equal(queuedBacklog.gps.connectionState, "lost");
assert.equal(queuedBacklog.gps.freshness, "missing");
assert.equal(queuedBacklog.gps.receivedAt, NOW.toISOString());
assert.notEqual(queuedBacklog.gps.recordedAt, queuedBacklog.gps.receivedAt);
assert.equal(getNextGpsFreshnessDeadline(queuedVehicle, queuedBacklog), null);

// La misma autoridad permite que una captura inmediata de la cola sea live.
const queuedImmediateVehicle = vehicleAt(0, {
  locationReceivedAt: NOW.toISOString(),
  locationTimestampSource: "transport_queue_age"
});
const queuedImmediate = buildOperationalUnitSnapshot({
  vehicle: queuedImmediateVehicle,
  now: NOW
});
assert.equal(queuedImmediate.gps.connectionState, "live");
assert.equal(queuedImmediate.gps.freshness, "fresh");
assert.equal(
  getNextGpsFreshnessDeadline(queuedImmediateVehicle, queuedImmediate).toISOString(),
  "2026-08-10T07:30:09.000Z",
  "la cola usa el instante de captura reconstruido, no la recepcion tardia"
);

// Compatibilidad con registros previos a locationReceivedAt.
const legacyVehicle = vehicleAt(12, { locationReceivedAt: undefined });
const legacy = buildOperationalUnitSnapshot({
  vehicle: legacyVehicle,
  now: NOW
});
assert.equal(legacy.gps.ageSeconds, 12);
assert.equal(legacy.gps.connectionState, "delayed");
assert.equal(legacy.gps.freshness, "fresh");
assert.equal(legacy.operationalState, "unknown");
assert.equal(
  getNextGpsFreshnessDeadline(legacyVehicle, legacy).toISOString(),
  "2026-08-10T07:30:04.000Z"
);

console.log("ok - GPS freshness aplica lease rapido con deadlines por unidad y sin fingir operacion activa");