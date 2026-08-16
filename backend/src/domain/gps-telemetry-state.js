/**
 * Autoridad semantica UNICA del estado de telemetria GPS de una unidad.
 *
 * Antes existian tres derivaciones que se contradecian sobre el mismo vehiculo
 * en el mismo instante:
 *
 *  1. `services/tracking-time.js buildGpsFreshness()` — umbral de 120 s sobre el
 *     reloj del telefono (`locationTimestamp`), taxonomia fresh/stale/missing.
 *     Alimentaba `/locations/live`, el evento socket `location:updated` y las
 *     incidencias.
 *  2. `domain/operational-unit-snapshot.js buildGps()` — umbrales 8/15/30 s sobre
 *     el reloj del servidor (`locationReceivedAt`), taxonomia connectionState.
 *     Alimentaba el snapshot operacional.
 *  3. `ventas/features/portal/utils/tracking.ts` — colapso a booleano.
 *
 * Una unidad que dejo de reportar hace 20 s era simultaneamente "fresh" para
 * REST y "stale" para el snapshot. Este modulo deja una sola escalera y las
 * otras superficies la consumen; no la recalculan.
 *
 * Reglas duras:
 *  - La antiguedad de la cuenta del conductor NO participa. La unica autoridad
 *    es la telemetria realmente ingerida por el vehiculo.
 *  - `never_reported` (jamas llego un paquete) es un estado propio y distinto de
 *    `lost` (llego telemetria y se perdio la senal). Confundirlos es lo que hacia
 *    que una unidad recien dada de alta dijera "GPS vencido".
 *  - Una ultima posicion conocida NUNCA se descarta por ser antigua. El estado
 *    describe la salud del enlace, no la existencia de la coordenada.
 */

// El foreground GPS reporta aproximadamente cada 5 s. Un lease de 8 s deja
// margen para jitter de una entrega sin permitir que una unidad desconectada
// parezca viva durante decenas de segundos.
const GPS_LIVE_MAX_AGE_SECONDS = 8;
const GPS_DELAYED_MAX_AGE_SECONDS = 15;
const GPS_STALE_MAX_AGE_SECONDS = 30;

/**
 * Taxonomia canonica. Los clientes solo presentan estos valores.
 *
 *  never_reported -> "Esperando primera ubicacion"
 *  live           -> "GPS en vivo"
 *  delayed        -> "GPS retrasado - hace X"
 *  stale          -> "GPS sin senal - hace X"
 *  lost           -> "GPS perdido - ultima ubicacion hace X"
 */
const GPS_CONNECTION_STATES = Object.freeze([
  "never_reported",
  "live",
  "delayed",
  "stale",
  "lost"
]);

/** Mapa de compatibilidad hacia la taxonomia legada de tres estados. */
const LEGACY_FRESHNESS_BY_STATE = Object.freeze({
  live: "fresh",
  delayed: "fresh",
  stale: "stale",
  lost: "missing",
  never_reported: "missing"
});

function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function finiteOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Instante que manda para decidir si el enlace sigue vivo.
 *
 * Para paquetes normales la recepcion del servidor es la autoridad, de modo que
 * un reloj de telefono adelantado o atrasado no altere el estado vivo. Cuando el
 * paquete viene de una cola offline, `transport_queue_age` significa que el
 * backend ya reconstruyo el instante de captura con su propio reloj: ahi manda la
 * captura y no la recepcion tardia, para no "rejuvenecer" un backlog al recuperar
 * Internet.
 */
function resolveAuthorityTime({ recordedAt, receivedAt, timestampSource }) {
  return timestampSource === "transport_queue_age" ? recordedAt : receivedAt || recordedAt;
}

/**
 * @param {object} vehicle Documento de vehiculo (crudo o enriquecido).
 * @param {number} nowMs   Instante de evaluacion en epoch ms.
 * @returns {{
 *   state: string,
 *   ageSeconds: number|null,
 *   hasPosition: boolean,
 *   hasEverReported: boolean,
 *   latitude: number|null,
 *   longitude: number|null,
 *   recordedAt: Date|null,
 *   receivedAt: Date|null,
 *   authorityTime: Date|null
 * }}
 */
function buildGpsTelemetryState(vehicle, nowMs = Date.now()) {
  const recordedAt = toDate(vehicle?.locationTimestamp);
  const receivedAt = toDate(vehicle?.locationReceivedAt);
  const timestampSource = String(vehicle?.locationTimestampSource || "").trim();
  const latitude = finiteOrNull(vehicle?.location?.latitude);
  const longitude = finiteOrNull(vehicle?.location?.longitude);
  const hasPosition = latitude !== null && longitude !== null;

  // Los sellos de telemetria solo los escribe la ingesta real. Su ausencia junto
  // con la de coordenadas es la prueba de que esta unidad jamas reporto.
  const hasEverReported = Boolean(recordedAt || receivedAt || hasPosition);

  // Sin coordenadas no hay nada que ubicar, por reciente que sea el sello de
  // tiempo. La edad describe la salud de una posicion; si no hay posicion, no
  // hay edad que reportar y el estado no puede afirmar enlace vivo.
  if (!hasPosition) {
    return {
      state: hasEverReported ? "lost" : "never_reported",
      ageSeconds: null,
      hasPosition: false,
      hasEverReported,
      latitude: null,
      longitude: null,
      recordedAt,
      receivedAt,
      authorityTime: null
    };
  }

  const authorityTime = resolveAuthorityTime({ recordedAt, receivedAt, timestampSource });
  const ageSeconds = authorityTime
    ? Math.max(0, Math.round((nowMs - authorityTime.getTime()) / 1000))
    : null;

  const state = ageSeconds === null || ageSeconds > GPS_STALE_MAX_AGE_SECONDS
    ? "lost"
    : ageSeconds <= GPS_LIVE_MAX_AGE_SECONDS
      ? "live"
      : ageSeconds <= GPS_DELAYED_MAX_AGE_SECONDS
        ? "delayed"
        : "stale";

  return {
    state,
    ageSeconds,
    hasPosition,
    hasEverReported,
    latitude,
    longitude,
    recordedAt,
    receivedAt,
    authorityTime
  };
}

/** Proyeccion legada de tres estados. Derivada, nunca recalculada aparte. */
function toLegacyFreshness(state) {
  return LEGACY_FRESHNESS_BY_STATE[state] || "missing";
}

module.exports = {
  GPS_CONNECTION_STATES,
  GPS_DELAYED_MAX_AGE_SECONDS,
  GPS_LIVE_MAX_AGE_SECONDS,
  GPS_STALE_MAX_AGE_SECONDS,
  buildGpsTelemetryState,
  toLegacyFreshness
};
