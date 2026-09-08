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

const CLIENT_QUEUE_AGE_SOURCE_MONOTONIC = "monotonic";
const CLIENT_QUEUE_AGE_SOURCE_WALL_CLOCK = "wall_clock_fallback";
const CLIENT_QUEUE_AGE_SOURCE_LEGACY = "legacy_unverified";

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

function normalizeClientQueueAgeSource(value, hasQueueAge) {
  if (!hasQueueAge) return null;
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === CLIENT_QUEUE_AGE_SOURCE_MONOTONIC) return CLIENT_QUEUE_AGE_SOURCE_MONOTONIC;
  if (normalized === CLIENT_QUEUE_AGE_SOURCE_WALL_CLOCK) return CLIENT_QUEUE_AGE_SOURCE_WALL_CLOCK;
  return CLIENT_QUEUE_AGE_SOURCE_LEGACY;
}

function clockSkewReason(skewMs) {
  if (skewMs === null || Math.abs(skewMs) <= MAX_CLIENT_CLOCK_SKEW_MS) return null;
  return skewMs > 0 ? "client_clock_ahead" : "client_clock_behind";
}

/**
 * Normaliza el tiempo de captura sin confundir una resta de reloj de pared con
 * una duracion monotónica.
 *
 * Compatibilidad:
 * - un paquete directo (sin clientQueueAgeMs) conserva la politica histórica;
 * - clientes actuales/legacy que mandan queue age sin fuente siguen siendo live
 *   cuando su timestamp de dispositivo cae dentro del skew permitido;
 * - una cola con edad no verificable y reloj sospechoso queda historical-only:
 *   puede reconstruir Jornada, pero no debe competir por la posicion viva;
 * - solo `clientQueueAgeSource=monotonic` autoriza a reconstruir la captura como
 *   `receivedAt - clientQueueAgeMs` para live ordering.
 */
function normalizeTrackingTime(
  clientTimestamp,
  receivedAt = new Date(),
  clientQueueAgeMs = null,
  clientQueueAgeSource = null
) {
  const received = new Date(receivedAt);
  const safeReceived = Number.isNaN(received.getTime()) ? new Date() : received;
  const parsedClient = clientTimestamp ? new Date(clientTimestamp) : null;
  const hasValidClientTime = Boolean(parsedClient && !Number.isNaN(parsedClient.getTime()));
  const normalizedClientTimestamp = hasValidClientTime ? parsedClient.toISOString() : null;
  const skewMs = hasValidClientTime ? parsedClient.getTime() - safeReceived.getTime() : null;
  const withinAcceptedSkew = skewMs !== null && Math.abs(skewMs) <= MAX_CLIENT_CLOCK_SKEW_MS;
  const normalizedQueueAgeMs = normalizeClientQueueAge(clientQueueAgeMs);
  const hasQueueAge = normalizedQueueAgeMs !== null;
  const normalizedQueueAgeSource = normalizeClientQueueAgeSource(clientQueueAgeSource, hasQueueAge);
  const queueAgeTrusted = hasQueueAge && normalizedQueueAgeSource === CLIENT_QUEUE_AGE_SOURCE_MONOTONIC;
  const transportCapturedAt = queueAgeTrusted
    ? new Date(safeReceived.getTime() - normalizedQueueAgeMs)
    : null;
  const invalidClientTimestamp = Boolean(clientTimestamp && !hasValidClientTime);
  const skewReason = clockSkewReason(skewMs);

  if (queueAgeTrusted) {
    const capturedAt = transportCapturedAt.toISOString();
    return {
      clientTimestamp: normalizedClientTimestamp,
      receivedAt: safeReceived.toISOString(),
      processedTimestamp: capturedAt,
      historicalTimestamp: capturedAt,
      transportCapturedAt: capturedAt,
      clientQueueAgeMs: normalizedQueueAgeMs,
      clientQueueAgeSource: normalizedQueueAgeSource,
      queueAgeTrusted: true,
      liveEligible: true,
      clockSkewMs: skewMs,
      timestampSource: "transport_queue_age",
      discardReason: invalidClientTimestamp ? "invalid_client_timestamp" : null
    };
  }

  if (hasQueueAge) {
    if (hasValidClientTime && withinAcceptedSkew) {
      return {
        clientTimestamp: normalizedClientTimestamp,
        receivedAt: safeReceived.toISOString(),
        processedTimestamp: normalizedClientTimestamp,
        historicalTimestamp: normalizedClientTimestamp,
        transportCapturedAt: null,
        clientQueueAgeMs: normalizedQueueAgeMs,
        clientQueueAgeSource: normalizedQueueAgeSource,
        queueAgeTrusted: false,
        liveEligible: true,
        clockSkewMs: skewMs,
        timestampSource: "client",
        discardReason: null
      };
    }

    return {
      clientTimestamp: normalizedClientTimestamp,
      receivedAt: safeReceived.toISOString(),
      processedTimestamp: normalizedClientTimestamp || safeReceived.toISOString(),
      historicalTimestamp: normalizedClientTimestamp,
      transportCapturedAt: null,
      clientQueueAgeMs: normalizedQueueAgeMs,
      clientQueueAgeSource: normalizedQueueAgeSource,
      queueAgeTrusted: false,
      liveEligible: false,
      clockSkewMs: skewMs,
      timestampSource: normalizedClientTimestamp ? "client_untrusted_history" : "server",
      discardReason: invalidClientTimestamp ? "invalid_client_timestamp" : (skewReason || "unverified_queue_age")
    };
  }

  const processedTimestamp = withinAcceptedSkew
    ? normalizedClientTimestamp
    : safeReceived.toISOString();

  return {
    clientTimestamp: normalizedClientTimestamp,
    receivedAt: safeReceived.toISOString(),
    processedTimestamp,
    historicalTimestamp: normalizedClientTimestamp || processedTimestamp,
    transportCapturedAt: null,
    clientQueueAgeMs: null,
    clientQueueAgeSource: null,
    queueAgeTrusted: false,
    liveEligible: true,
    clockSkewMs: skewMs,
    timestampSource: withinAcceptedSkew ? "client" : "server",
    discardReason: invalidClientTimestamp ? "invalid_client_timestamp" : skewReason
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

/**
 * Instante de inicio de una jornada.
 *
 * Una jornada iniciada sin Internet existe realmente desde que el conductor la
 * inicio, no desde que el telefono recupero conexion. Sin esto, al reconciliar la
 * cola offline el servidor sellaba `startedAt` con la hora de reconexion y TODOS
 * los puntos capturados durante el corte quedaban por debajo del inicio de la
 * sesion, de modo que `canSessionAcceptPosition` los descartaba en silencio: el
 * recorrido se veia en el mapa pero no quedaba en el historial.
 *
 * El valor declarado por el cliente solo se acepta hacia el pasado y dentro de la
 * misma ventana que la cola offline (`MAX_CLIENT_QUEUE_AGE_MS`): mas alla de ahi
 * no puede existir evidencia real. Nunca se acepta hacia el futuro, para que un
 * reloj adelantado no abra una jornada que todavia no ocurre.
 */
function resolveSessionStartedAt(requestedStartedAt, now = new Date()) {
  const reference = new Date(now);
  const safeNow = Number.isNaN(reference.getTime()) ? new Date() : reference;
  const parsed = requestedStartedAt ? new Date(requestedStartedAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return safeNow.toISOString();

  const earliestAccepted = safeNow.getTime() - MAX_CLIENT_QUEUE_AGE_MS;
  if (parsed.getTime() > safeNow.getTime()) return safeNow.toISOString();
  if (parsed.getTime() < earliestAccepted) return new Date(earliestAccepted).toISOString();
  return parsed.toISOString();
}

module.exports = {
  CLIENT_QUEUE_AGE_SOURCE_LEGACY,
  CLIENT_QUEUE_AGE_SOURCE_MONOTONIC,
  CLIENT_QUEUE_AGE_SOURCE_WALL_CLOCK,
  GPS_FRESHNESS_MS,
  MAX_CLIENT_CLOCK_SKEW_MS,
  MAX_CLIENT_QUEUE_AGE_MS,
  buildGpsFreshness,
  normalizeClientQueueAge,
  normalizeClientQueueAgeSource,
  normalizeTrackingTime,
  resolveSessionStartedAt
};
