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

// Una edad de cola certificada como monotona gobierna tanto live como historia.
decision = normalizeTrackingTime(
  "2026-07-17T10:00:00.000Z",
  receivedAt,
  30 * 60 * 1000,
  "monotonic"
);
assert.equal(decision.timestampSource, "transport_queue_age");
assert.equal(decision.receivedAt, "2026-07-17T12:00:00.000Z");
assert.equal(decision.processedTimestamp, "2026-07-17T11:30:00.000Z");
assert.equal(decision.historyTimestamp, "2026-07-17T11:30:00.000Z");
assert.equal(decision.transportCapturedAt, "2026-07-17T11:30:00.000Z");
assert.equal(decision.clientQueueAgeMs, 30 * 60 * 1000);
assert.equal(decision.clientQueueAgeSource, "monotonic");
assert.equal(decision.queueAgeTrusted, true);
assert.equal(decision.shouldApplyLiveProjection, true);
assert.equal(decision.discardReason, null);

// El reloj de pared no puede fingir una duracion. El backlog legacy conserva su
// timestamp de captura como evidencia historica, pero no puede pisar live.
decision = normalizeTrackingTime(
  "2026-07-17T10:00:00.000Z",
  receivedAt,
  0
);
assert.equal(decision.clientQueueAgeSource, "legacy_wall_clock");
assert.equal(decision.queueAgeTrusted, false);
assert.equal(decision.timestampSource, "server");
assert.equal(decision.processedTimestamp, receivedAt.toISOString());
assert.equal(decision.historyTimestamp, "2026-07-17T10:00:00.000Z");
assert.equal(decision.historyTimestampSource, "client_queue_timestamp");
assert.equal(decision.shouldApplyLiveProjection, false);
assert.equal(decision.discardReason, "untrusted_client_queue_age");

// Un cliente legacy que envia inmediatamente sigue pudiendo actualizar live por
// su timestamp dentro del skew, sin convertir su edad wall-clock en autoridad.
decision = normalizeTrackingTime(
  "2026-07-17T11:59:30.000Z",
  receivedAt,
  30_000
);
assert.equal(decision.timestampSource, "client");
assert.equal(decision.clientQueueAgeSource, "legacy_wall_clock");
assert.equal(decision.queueAgeTrusted, false);
assert.equal(decision.shouldApplyLiveProjection, true);
assert.equal(decision.processedTimestamp, "2026-07-17T11:59:30.000Z");

// Una duracion monotona permanece independiente del wall clock incluso con un
// timestamp de telefono wildly skewed.
decision = normalizeTrackingTime("2026-07-16T12:00:00.000Z", receivedAt, 0, "monotonic");
assert.equal(decision.timestampSource, "transport_queue_age");
assert.equal(decision.processedTimestamp, receivedAt.toISOString());
assert.equal(decision.clientQueueAgeMs, 0);
assert.equal(decision.queueAgeTrusted, true);

// Sin edad de cola, clientes skewed conservan autoridad de recepcion servidor.
decision = normalizeTrackingTime("2026-07-16T12:00:00.000Z", receivedAt);
assert.equal(decision.timestampSource, "server");
assert.equal(decision.processedTimestamp, receivedAt.toISOString());
assert.equal(decision.discardReason, "client_clock_behind");

// Edades gigantes certificadas siguen acotadas a la politica de retencion.
decision = normalizeTrackingTime(
  "2026-07-17T11:59:59.000Z",
  receivedAt,
  MAX_CLIENT_QUEUE_AGE_MS * 10,
  "monotonic"
);
assert.equal(decision.clientQueueAgeMs, MAX_CLIENT_QUEUE_AGE_MS);

// Fuente inventada/desconocida nunca se promueve a monotona.
decision = normalizeTrackingTime(
  "2026-07-17T10:00:00.000Z",
  receivedAt,
  30 * 60 * 1000,
  "elapsed-ish"
);
assert.equal(decision.queueAgeTrusted, false);
assert.equal(decision.clientQueueAgeSource, "legacy_wall_clock");
assert.equal(decision.shouldApplyLiveProjection, false);

// `buildGpsFreshness` ya no mantiene una escalera propia de 120 s: delega en
// `domain/gps-telemetry-state.js`. Antes la misma unidad podia salir "fresh" por
// REST y "stale" por el snapshot operacional en el mismo instante.
const vehicleAt = (isoTimestamp) => ({
  location: { latitude: 19.43, longitude: -99.13 },
  locationTimestamp: isoTimestamp,
  locationReceivedAt: isoTimestamp
});

assert.equal(buildGpsFreshness(vehicleAt("2026-07-17T11:59:52.000Z"), receivedAt).connectionState, "live");
assert.equal(buildGpsFreshness(vehicleAt("2026-07-17T11:59:52.000Z"), receivedAt).state, "fresh");
assert.equal(buildGpsFreshness(vehicleAt("2026-07-17T11:59:50.000Z"), receivedAt).connectionState, "delayed");
assert.equal(buildGpsFreshness(vehicleAt("2026-07-17T11:59:40.000Z"), receivedAt).connectionState, "stale");
assert.equal(buildGpsFreshness(vehicleAt("2026-07-17T11:59:00.000Z"), receivedAt).connectionState, "lost");
assert.equal(buildGpsFreshness(vehicleAt("2026-07-17T11:59:00.000Z"), receivedAt).state, "missing");

// Autoridad compartida: REST/socket y snapshot coinciden sobre el mismo vehiculo.
const { buildOperationalUnitSnapshot } = require("../src/domain/operational-unit-snapshot");
for (const isoTimestamp of [
  "2026-07-17T11:59:52.000Z",
  "2026-07-17T11:59:50.000Z",
  "2026-07-17T11:59:40.000Z",
  "2026-07-17T11:59:00.000Z"
]) {
  const vehicle = { id: "veh-1", code: "C-1", status: "available", ...vehicleAt(isoTimestamp) };
  assert.equal(
    buildGpsFreshness(vehicle, receivedAt).connectionState,
    buildOperationalUnitSnapshot({ vehicle, now: receivedAt }).gps.connectionState,
    `REST y snapshot discrepan sobre ${isoTimestamp}`
  );
}

// Una unidad que jamas reporto no esta "vencida": esta esperando su primer paquete.
const neverReported = buildGpsFreshness({ id: "veh-2", code: "C-2" }, receivedAt);
assert.equal(neverReported.connectionState, "never_reported");
assert.equal(neverReported.hasEverReported, false);
assert.equal(neverReported.ageSeconds, null);
assert.equal(neverReported.state, "missing");
console.log("tracking integrity tests passed");