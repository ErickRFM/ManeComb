/**
 * Proyeccion operacional canonica.
 *
 * Este modulo es la UNICA fuente de verdad sobre como se interpreta el estado
 * de una unidad: identidad, estado, GPS, ruta, conductor, ETA e incidencias.
 * Mobile y Portal consumen el resultado sin reinterpretarlo.
 *
 * Reglas duras:
 *  - `route.etaAt` es el unico ETA del sistema. No existe `etaMinutes`.
 *  - `gps.speedKmh` ya viene convertido. Ningun cliente vuelve a convertir.
 *  - `visibility` NUNCA depende de la frescura del GPS ni del estado de tracking.
 *    Una unidad dada de alta es visible aunque no tenga GPS, sesion ni ruta.
 */

const GPS_FRESH_MAX_AGE_SECONDS = 120;
const GPS_STALE_MAX_AGE_SECONDS = 900;

/** Estados de vehiculo que retiran la unidad del inventario visible. */
const HIDDEN_VEHICLE_STATUSES = new Set(["archived", "deleted", "retired"]);

/** Estados de sesion que se consideran jornada vigente. */
const ACTIVE_SESSION_STATUSES = new Set(["ASSIGNED", "READY", "RUNNING", "PAUSED"]);

/** Estados crudos de vehiculo que representan operacion en curso. */
const ACTIVE_VEHICLE_STATUSES = new Set(["online", "patrolling", "on-route", "active"]);

/**
 * Rotulos de presentacion que el store escribe como si fueran datos.
 * Ver data/store.js:207. No pueden viajar en el contrato como nombre de ruta.
 */
const PLACEHOLDER_ROUTE_NAMES = new Set(["sin ruta", "n/a", "-", "ruta sin asignar"]);

/** Por debajo de esta velocidad la unidad se considera detenida. */
const STOPPED_SPEED_KMH = 3;

/**
 * Velocidades por encima de este valor se interpretan como km/h ya convertidos.
 * Coincide con la heuristica de services/route-progress.js.
 */
const SPEED_MS_UPPER_BOUND = 45;

function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value) {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : null;
}

function finiteOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonEmptyString(value) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function clampRatio(value) {
  const parsed = finiteOrNull(value);
  if (parsed === null) return null;
  return Math.min(1, Math.max(0, parsed));
}

/**
 * Convierte a km/h. Acepta m/s (caso normal) y tolera fuentes que ya
 * entregan km/h, sin duplicar la conversion.
 */
function toSpeedKmh(rawSpeed) {
  const speed = finiteOrNull(rawSpeed);
  if (speed === null || speed < 0) return null;
  return Math.round((speed > SPEED_MS_UPPER_BOUND ? speed : speed * 3.6) * 10) / 10;
}

function buildGps(vehicle, progress, nowMs) {
  const recordedAt = toDate(vehicle?.locationTimestamp);
  const latitude = finiteOrNull(vehicle?.location?.latitude);
  const longitude = finiteOrNull(vehicle?.location?.longitude);
  const hasPosition = latitude !== null && longitude !== null && recordedAt !== null;

  if (!hasPosition) {
    return {
      lat: null,
      lng: null,
      speedKmh: null,
      heading: null,
      recordedAt: null,
      freshness: "missing",
      ageSeconds: null
    };
  }

  const ageSeconds = Math.max(0, Math.round((nowMs - recordedAt.getTime()) / 1000));
  const freshness =
    ageSeconds <= GPS_FRESH_MAX_AGE_SECONDS
      ? "fresh"
      : ageSeconds <= GPS_STALE_MAX_AGE_SECONDS
        ? "stale"
        : "missing";

  return {
    lat: latitude,
    lng: longitude,
    speedKmh: toSpeedKmh(progress?.speedMetersPerSecond ?? vehicle?.speed),
    heading: finiteOrNull(vehicle?.heading ?? progress?.heading),
    recordedAt: recordedAt.toISOString(),
    freshness,
    ageSeconds
  };
}

/**
 * Orden de fallback unico para todo el sistema: sesion -> asignacion -> ninguno.
 */
function buildDriver({ vehicle, activeSession, driver }) {
  const sessionDriverId = nonEmptyString(activeSession?.driverId);
  if (sessionDriverId) {
    return {
      id: sessionDriverId,
      name: nonEmptyString(driver?.name) || nonEmptyString(vehicle?.driverName) || "Conductor en jornada",
      source: "session"
    };
  }

  const assignedDriverId = nonEmptyString(vehicle?.driverId);
  if (assignedDriverId) {
    return {
      id: assignedDriverId,
      name: nonEmptyString(driver?.name) || nonEmptyString(vehicle?.driverName) || "Conductor asignado",
      source: "assignment"
    };
  }

  return null;
}

function buildRoute({ vehicle, route, activeSession, progress }) {
  const assignedRoute = vehicle?.assignedRoute || null;

  // La identidad de una ruta es su id. Un nombre suelto no constituye una ruta:
  // el store inyecta rotulos de presentacion ("Sin ruta", "N/A") cuando no hay
  // asignacion, y esos rotulos no pueden convertirse en una ruta fantasma.
  const routeId =
    nonEmptyString(assignedRoute?.routeId) ||
    nonEmptyString(vehicle?.routeId) ||
    nonEmptyString(route?.id) ||
    nonEmptyString(activeSession?.routeId);

  if (!routeId) {
    return null;
  }

  const routeName =
    nonEmptyString(assignedRoute?.routeName) ||
    nonEmptyString(route?.name) ||
    nonEmptyString(vehicle?.routeName) ||
    nonEmptyString(assignedRoute?.route?.label);

  const checkpointCount = finiteOrNull(progress?.checkpointCount);
  const currentIndex = finiteOrNull(progress?.currentCheckpointIndex);
  const progressPercent = finiteOrNull(progress?.progressPercent);

  return {
    id: routeId,
    name: PLACEHOLDER_ROUTE_NAMES.has(String(routeName ?? "").toLowerCase())
      ? "Ruta asignada"
      : routeName || "Ruta asignada",
    startedAt: toIso(activeSession?.startedAt),
    progressRatio: progressPercent === null ? null : clampRatio(progressPercent / 100),
    remainingTimeSeconds:
      progress?.timeRemainingSeconds === undefined || progress?.timeRemainingSeconds === null
        ? null
        : Math.max(0, Math.round(Number(progress.timeRemainingSeconds) || 0)),
    // Unico ETA del sistema. Ya viene como instante absoluto desde route-progress.
    etaAt: toIso(progress?.etaAt),
    deviationMeters:
      progress?.distanceFromRoute === undefined || progress?.distanceFromRoute === null
        ? null
        : Math.max(0, Math.round(Number(progress.distanceFromRoute) || 0)),
    currentCheckpoint:
      checkpointCount && currentIndex !== null && checkpointCount > 0
        ? `${Math.min(checkpointCount, Math.max(0, Math.round(currentIndex)))}/${Math.round(checkpointCount)}`
        : null
  };
}

function buildSession(activeSession, nowMs) {
  if (!activeSession) return null;

  const startedAt = toDate(activeSession.startedAt);
  if (!startedAt) return null;

  return {
    id: String(activeSession.id ?? activeSession._id ?? ""),
    startedAt: startedAt.toISOString(),
    elapsedSeconds: Math.max(0, Math.round((nowMs - startedAt.getTime()) / 1000))
  };
}

function buildIncidents(incidents) {
  const relevant = (Array.isArray(incidents) ? incidents : []).filter(
    (incident) => incident && (incident.status === "open" || incident.status === "in_progress")
  );

  const lastAt = relevant.reduce((latest, incident) => {
    const createdAt = toDate(incident.createdAt);
    if (!createdAt) return latest;
    return !latest || createdAt.getTime() > latest.getTime() ? createdAt : latest;
  }, null);

  return {
    open: relevant.filter((incident) => incident.status === "open").length,
    inProgress: relevant.filter((incident) => incident.status === "in_progress").length,
    lastAt: lastAt ? lastAt.toISOString() : null
  };
}

function buildStatus({ vehicle, activeSession }) {
  const raw = String(vehicle?.status ?? "").trim().toLowerCase();

  if (raw === "maintenance") return "maintenance";
  if (raw === "offline") return "offline";

  const sessionStatus = String(activeSession?.status ?? "").trim().toUpperCase();
  if (sessionStatus === "RUNNING") return "active";
  if (ACTIVE_VEHICLE_STATUSES.has(raw)) return "active";

  return "idle";
}

function buildOperationalState({ status, route, gps, activeSession }) {
  if (status === "maintenance") return "maintenance";
  if (!route) return "no_route";

  const sessionStatus = String(activeSession?.status ?? "").trim().toUpperCase();
  if (sessionStatus === "PAUSED") return "stopped";

  const speedKmh = gps.speedKmh;
  if (speedKmh !== null && speedKmh < STOPPED_SPEED_KMH) return "stopped";
  if (status === "active") return "on_route";

  return "stopped";
}

function buildLastEventAt(candidates) {
  return candidates
    .map(toDate)
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())
    .map((value) => value.toISOString())[0] ?? null;
}

/**
 * @param {object} input
 * @param {object} input.vehicle         Documento de vehiculo (crudo o enriquecido).
 * @param {object} [input.route]         Entrada del catalogo de rutas, si se resolvio.
 * @param {object} [input.activeSession] Sesion de ruta no terminal de esta unidad.
 * @param {object} [input.driver]        Usuario conductor resuelto.
 * @param {Array}  [input.incidents]     Incidencias de esta unidad.
 * @param {object} [input.lastEvent]     Ultimo evento de ruta.
 * @param {Date|string|number} [input.now]
 * @returns {object} OperationalUnitSnapshot
 */
function buildOperationalUnitSnapshot(input) {
  const {
    vehicle,
    route = null,
    activeSession: rawSession = null,
    driver = null,
    incidents = [],
    lastEvent = null,
    now = new Date()
  } = input || {};

  if (!vehicle) {
    throw new TypeError("buildOperationalUnitSnapshot requiere un vehiculo");
  }

  const parsedNow = toDate(now);
  const nowMs = parsedNow ? parsedNow.getTime() : Date.now();

  const activeSession =
    rawSession && ACTIVE_SESSION_STATUSES.has(String(rawSession.status ?? "").toUpperCase())
      ? rawSession
      : null;

  const progress = vehicle.activeRouteProgress || null;
  const gps = buildGps(vehicle, progress, nowMs);
  const status = buildStatus({ vehicle, activeSession });
  const resolvedRoute = buildRoute({ vehicle, route, activeSession, progress });

  const rawStatus = String(vehicle.status ?? "").trim().toLowerCase();

  return {
    unitId: String(vehicle.id ?? vehicle._id ?? ""),
    plates: nonEmptyString(vehicle.plate),
    label: nonEmptyString(vehicle.code) || nonEmptyString(vehicle.plate) || "Unidad sin folio",
    status,
    operationalState: buildOperationalState({ status, route: resolvedRoute, gps, activeSession }),
    gps,
    driver: buildDriver({ vehicle, activeSession, driver }),
    route: resolvedRoute,
    session: buildSession(activeSession, nowMs),
    incidents: buildIncidents(incidents),
    lastEventAt: buildLastEventAt([
      lastEvent?.timestamp,
      vehicle.updatedAt,
      vehicle.locationTimestamp,
      progress?.timestamp,
      activeSession?.updatedAt
    ]),
    // Depende solo del alta de la unidad. Jamas de la frescura del GPS.
    visibility: HIDDEN_VEHICLE_STATUSES.has(rawStatus) ? "hidden" : "visible"
  };
}

module.exports = {
  GPS_FRESH_MAX_AGE_SECONDS,
  GPS_STALE_MAX_AGE_SECONDS,
  STOPPED_SPEED_KMH,
  HIDDEN_VEHICLE_STATUSES,
  ACTIVE_SESSION_STATUSES,
  buildOperationalUnitSnapshot
};
