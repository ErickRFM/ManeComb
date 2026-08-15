const MAX_CLIENT_CLOCK_SKEW_MS = Math.max(0, Number(process.env.TRACKING_MAX_CLOCK_SKEW_MS) || 5 * 60 * 1000);
const MAX_CLIENT_QUEUE_AGE_MS = Math.max(
  MAX_CLIENT_CLOCK_SKEW_MS,
  Number(process.env.TRACKING_MAX_CLIENT_QUEUE_AGE_MS) || 24 * 60 * 60 * 1000
);
const {
  GPS_DELAYED_MAX_AGE_SECONDS,
  buildGpsTelemetryState,
  toLegacyFreshness
} = require("../domain/gps-telemetry-state");

/**
 * Conservado como constante derivada: `TRACKING_GPS_FRESHNESS_MS` ya no define
 * la frescura. Un segundo umbral configurable era precisamente la causa de que
 * REST y snapshot se contradijeran.
 */
const GPS_FRESHNESS_MS = GPS_DELAYED_MAX_AGE_SECONDS * 1000;

function normalizeClientQueueAge(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(MAX_CLIENT_QUEUE_AGE_MS, Math.round(parsed));
}

function normalizeTrackingTime(clientTimestamp, receivedAt = new Date(), clientQueueAgeMs = null) {
  const received = new Date(receivedAt);
  const safeReceived = Number.isNaN(received.getTime()) ? new Date() : received;
  const parsedClient = clientTimestamp ? new Date(clientTimestamp) : null;
  const hasValidClientTime = parsedClient && !Number.isNaN(parsedClient.getTime());
  const skewMs = hasValidClientTime ? parsedClient.getTime() - safeReceived.getTime() : null;
  const withinAcceptedSkew = skewMs !== null && Math.abs(skewMs) <= MAX_CLIENT_CLOCK_SKEW_MS;
  const normalizedQueueAgeMs = normalizeClientQueueAge(clientQueueAgeMs);
  const hasTransportQueueAge = normalizedQueueAgeMs !== null;
  const transportCapturedAt = hasTransportQueueAge
    ? new Date(safeReceived.getTime() - normalizedQueueAgeMs)
    : null;

  return {
    clientTimestamp: hasValidClientTime ? parsedClient.toISOString() : null,
    receivedAt: safeReceived.toISOString(),
    processedTimestamp: hasTransportQueueAge
      ? transportCapturedAt.toISOString()
      : withinAcceptedSkew
        ? parsedClient.toISOString()
        : safeReceived.toISOString(),
    transportCapturedAt: transportCapturedAt ? transportCapturedAt.toISOString() : null,
    clientQueueAgeMs: normalizedQueueAgeMs,
    clockSkewMs: skewMs,
    timestampSource: hasTransportQueueAge
      ? "transport_queue_age"
      : withinAcceptedSkew
        ? "client"
        : "server",
    discardReason: clientTimestamp && !hasValidClientTime
      ? "invalid_client_timestamp"
      : !hasTransportQueueAge && skewMs !== null && !withinAcceptedSkew
        ? (skewMs > 0 ? "client_clock_ahead" : "client_clock_behind")
        : null
  };
}

/**
 * Proyeccion de transporte de la frescura GPS.
 *
 * NO calcula estado: delega en `domain/gps-telemetry-state.js`, la autoridad
 * semantica unica. Antes esta funcion mantenia su propia escalera de 120 s sobre
 * el reloj del telefono, asi que `/locations/live`, el socket y las incidencias
 * podian afirmar "fresh" sobre la misma unidad que el snapshot operacional daba
 * por `stale`. Ahora ambas superficies leen la misma escalera.
 *
 * Acepta el vehiculo completo (forma preferida, porque `locationReceivedAt` y
 * `locationTimestampSource` son parte de la autoridad) y tolera recibir solo un
 * `locationTimestamp` para llamadores legados.
 */
function buildGpsFreshness(vehicleOrTimestamp, evaluatedAt = new Date()) {
  const vehicle =
    vehicleOrTimestamp && typeof vehicleOrTimestamp === "object" && !(vehicleOrTimestamp instanceof Date)
      ? vehicleOrTimestamp
      : { locationTimestamp: vehicleOrTimestamp, location: vehicleOrTimestamp ? { latitude: 0, longitude: 0 } : null };

  const evaluated = new Date(evaluatedAt);
  const safeEvaluated = Number.isNaN(evaluated.getTime()) ? new Date() : evaluated;
  const telemetry = buildGpsTelemetryState(vehicle, safeEvaluated.getTime());
  const freshUntil = telemetry.authorityTime
    ? new Date(telemetry.authorityTime.getTime() + GPS_DELAYED_MAX_AGE_SECONDS * 1000)
    : null;

  return {
    // Taxonomia canonica. Los clientes presentan esto.
    connectionState: telemetry.state,
    ageSeconds: telemetry.ageSeconds,
    hasEverReported: telemetry.hasEverReported,
    // Proyeccion legada de tres estados conservada durante la migracion.
    state: toLegacyFreshness(telemetry.state),
    isFresh: telemetry.state === "live" || telemetry.state === "delayed",
    thresholdMs: GPS_DELAYED_MAX_AGE_SECONDS * 1000,
    evaluatedAt: safeEvaluated.toISOString(),
    freshUntil: freshUntil ? freshUntil.toISOString() : null
  };
}

module.exports = {
  GPS_FRESHNESS_MS,
  MAX_CLIENT_CLOCK_SKEW_MS,
  MAX_CLIENT_QUEUE_AGE_MS,
  buildGpsFreshness,
  normalizeClientQueueAge,
  normalizeTrackingTime
};