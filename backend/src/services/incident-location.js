const { buildGpsTelemetryState } = require("../domain/gps-telemetry-state");

/**
 * Ventana de aceptacion propia del dominio de incidencias.
 *
 * "El enlace GPS esta vivo AHORA" y "esta posicion sirve para geolocalizar una
 * incidencia" son preguntas distintas. Un reporte levantado por el conductor
 * puede apoyarse en una posicion de hace un minuto sin mentir; exigirle el lease
 * de presencia de 8-15 s dejaria incidencias legitimas sin coordenada.
 *
 * Esto NO es una segunda escalera de frescura: el estado y la edad los calcula
 * `domain/gps-telemetry-state.js`. Aqui solo se declara cuanta edad tolera este
 * dominio.
 */
const INCIDENT_LOCATION_MAX_AGE_SECONDS = 120;

function hasCoordinates(location) {
  return Boolean(
    location &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude))
  );
}

function resolveIncidentLocation(vehicle, requestedLocation, evaluatedAt = new Date()) {
  if (!vehicle) {
    return {
      location: hasCoordinates(requestedLocation) ? requestedLocation : null,
      locationState: hasCoordinates(requestedLocation) ? "fresh" : "missing",
      locationSourceTimestamp: requestedLocation?.timestamp || null
    };
  }

  const evaluated = new Date(evaluatedAt);
  const telemetry = buildGpsTelemetryState(
    vehicle,
    Number.isNaN(evaluated.getTime()) ? Date.now() : evaluated.getTime()
  );
  const withinIncidentWindow =
    telemetry.ageSeconds !== null && telemetry.ageSeconds <= INCIDENT_LOCATION_MAX_AGE_SECONDS;

  if (!withinIncidentWindow || !hasCoordinates(vehicle.location)) {
    return {
      location: null,
      locationState: telemetry.hasEverReported ? "stale" : "missing",
      locationSourceTimestamp: vehicle.locationTimestamp || null
    };
  }

  return {
    location: {
      latitude: Number(vehicle.location.latitude),
      longitude: Number(vehicle.location.longitude),
      accuracy: Number.isFinite(Number(requestedLocation?.accuracy)) ? Number(requestedLocation.accuracy) : null,
      timestamp: vehicle.locationTimestamp
    },
    locationState: "fresh",
    locationSourceTimestamp: vehicle.locationTimestamp
  };
}

module.exports = { resolveIncidentLocation };
