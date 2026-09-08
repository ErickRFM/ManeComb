const assert = require("node:assert/strict");
const {
  CLIENT_QUEUE_AGE_SOURCE_LEGACY,
  CLIENT_QUEUE_AGE_SOURCE_MONOTONIC,
  CLIENT_QUEUE_AGE_SOURCE_WALL_CLOCK,
  MAX_CLIENT_QUEUE_AGE_MS,
  buildGpsFreshness,
  normalizeTrackingTime
} = require("../src/services/tracking-time");
const receivedAt = new Date("2026-07-17T12:00:00.000Z");

// Paquete directo: conserva la politica preexistente.
let decision = normalizeTrackingTime("2026-07-17T12:01:00.000Z", receivedAt);
assert.equal(decision.timestampSource, "client");
assert.equal(decision.liveEligible, true);
decision = normalizeTrackingTime("2026-07-17T13:00:00.000Z", receivedAt);
assert.equal(decision.timestampSource, "server");
assert.equal(decision.discardReason, "client_clock_ahead");
assert.equal(decision.liveEligible, true, "un paquete directo usa recepcion servidor si el reloj esta sesgado");
assert.equal(decision.clientTimestamp, "2026-07-17T13:00:00.000Z");
decision = normalizeTrackingTime("2026-07-17T10:00:00.000Z", receivedAt);
assert.equal(decision.discardReason, "client_clock_behind");
decision = normalizeTrackingTime("2026-07-17T11:59:30.000Z", receivedAt);
assert.equal(decision.timestampSource, "client");
assert.equal(decision.discardReason, null);

// Solo una edad declarada monotónica puede reconstruir la captura desde la
// recepcion servidor y competir por el ordering vivo.
decision = normalizeTrackingTime(
  "2026-07-17T10:00:00.000Z",
  receivedAt,
  30 * 60 * 1000,
  CLIENT_QUEUE_AGE_SOURCE_MONOTONIC
);
assert.equal(decision.timestampSource, "transport_queue_age");
assert.equal(decision.receivedAt, "2026-07-17T12:00:00.000Z");
assert.equal(decision.processedTimestamp, "2026-07-17T11:30:00.000Z");
assert.equal(decision.historicalTimestamp, "2026-07-17T11:30:00.000Z");
assert.equal(decision.transportCapturedAt, "2026-07-17T11:30:00.000Z");
assert.equal(decision.clientQueueAgeMs, 30 * 60 * 1000);
assert.equal(decision.clientQueueAgeSource, CLIENT_QUEUE_AGE_SOURCE_MONOTONIC);
assert.equal(decision.queueAgeTrusted, true);
assert.equal(decision.liveEligible, true);
assert.equal(decision.discardReason, null);

// Una edad legacy sin fuente ya no puede fingir ser monotónica. Si el timestamp
// es historico/sesgado se conserva para Jornada pero queda fuera del pin vivo.
decision = normalizeTrackingTime(
  "2026-07-17T10:00:00.000Z",
  receivedAt,
  30 * 60 * 1000
);
assert.equal(decision.clientQueueAgeSource, CLIENT_QUEUE_AGE_SOURCE_LEGACY);
assert.equal(decision.queueAgeTrusted, false);
assert.equal(decision.liveEligible, false);
assert.equal(decision.timestampSource, "client_untrusted_history");
assert.equal(decision.processedTimestamp, "2026-07-17T10:00:00.000Z");
assert.equal(decision.historicalTimestamp, "2026-07-17T10:00:00.000Z");
assert.equal(decision.transportCapturedAt, null);
assert.equal(decision.discardReason, "client_clock_behind");

// Compatibilidad inmediata: Android actual manda clientQueueAgeMs aun sin fuente.
// Mientras el timestamp este dentro del skew, ese paquete sigue siendo live.
decision = normalizeTrackingTime(
  "2026-07-17T11:59:59.000Z",
  receivedAt,
  1000
);
assert.equal(decision.clientQueueAgeSource, CLIENT_QUEUE_AGE_SOURCE_LEGACY);
assert.equal(decision.timestampSource, "client");
assert.equal(decision.liveEligible, true);
assert.equal(decision.processedTimestamp, "2026-07-17T11:59:59.000Z");

// Un fallback de wall clock se trata igual: util como compatibilidad, no como
// prueba monotónica para reconstruir un backlog con reloj sospechoso.
decision = normalizeTrackingTime(
  "2026-07-17T11:00:00.000Z",
  receivedAt,
  60 * 60 * 1000,
  CLIENT_QUEUE_AGE_SOURCE_WALL_CLOCK
);
assert.equal(decision.clientQueueAgeSource, CLIENT_QUEUE_AGE_SOURCE_WALL_CLOCK);
assert.equal(decision.queueAgeTrusted, false);
assert.equal(decision.liveEligible, false);
assert.equal(decision.timestampSource, "client_untrusted_history");

// Un source desconocido falla cerrado como legacy_unverified.
decision = normalizeTrackingTime(
  "2026-07-17T11:00:00.000Z",
  receivedAt,
  60 * 60 * 1000,
  "inventado"
);
assert.equal(decision.clientQueueAgeSource, CLIENT_QUEUE_AGE_SOURCE_LEGACY);
assert.equal(decision.liveEligible, false);

// Sin edad de cola, un cliente legacy/sesgado conserva la recepcion servidor.
decision = normalizeTrackingTime("2026-07-16T12:00:00.000Z", receivedAt);
assert.equal(decision.timestampSource, "server");
assert.equal(decision.processedTimestamp, receivedAt.toISOString());
assert.equal(decision.discardReason, "client_clock_behind");
assert.equal(decision.liveEligible, true);

// Edades gigantes siguen acotadas al horizonte existente; incluso una fuente
// monotónica no puede declarar mas historia que la politica de retencion.
decision = normalizeTrackingTime(
  "2026-07-17T11:59:59.000Z",
  receivedAt,
  MAX_CLIENT_QUEUE_AGE_MS * 10,
  CLIENT_QUEUE_AGE_SOURCE_MONOTONIC
);
assert.equal(decision.clientQueueAgeMs, MAX_CLIENT_QUEUE_AGE_MS);
assert.equal(decision.queueAgeTrusted, true);

// `buildGpsFreshness` no mantiene una escalera propia: delega en la autoridad
// 8/15/30 de `domain/gps-telemetry-state.js`. Este cambio temporal no la toca.
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
