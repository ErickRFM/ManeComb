const {
  canAccessTenantResource,
  getOrganizationId,
  getRolesWithPermission
} = require("../middlewares/access-control");
const { emitOperationalUnitUpdate } = require("./operational-units-service");
const { classifyGpsQuality, processRoutePosition } = require("./route-event-engine");
const { calculateAndPersistRouteMetrics } = require("./route-metrics-engine");
const { stabilizeGpsPosition } = require("./gps-position-stabilizer");
const { getOperationalScheduleState } = require("../utils/operational-schedule");
const { buildGpsFreshness, normalizeTrackingTime } = require("./tracking-time");
const { incrementMetric, observeDuration } = require("./metrics");
const logger = require("./logger");

class LocationIngestionError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "LocationIngestionError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalizePoint(point) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) return null;
  return { latitude, longitude };
}

function finiteOrNull(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Resuelve la jornada a la que pertenece un paquete.
 *
 * `pending:{vehicleId}` es la identidad LOCAL que Mobile usa para una jornada
 * iniciada sin Internet, y viaja tal cual en los puntos que se encolaron. Nunca
 * existe en el servidor, asi que `getRouteSessionById` devuelve null; su valor
 * esta en ser truthy: afirma que el cliente atribuye el punto a una jornada
 * concreta de esta unidad. Eso habilita la busqueda historica de abajo y, en
 * `canSessionAcceptPosition`, la aceptacion de una jornada ya FINISHED, que es lo
 * que permite que un backlog offline aterrice en la jornada correcta aunque el
 * conductor ya la haya cerrado.
 */
async function resolveTrackingSession(store, vehicleId, requestedSessionId, processedTimestamp) {
  const activeSession = await store.getActiveRouteSession(vehicleId);
  const requestedSession = requestedSessionId
    ? await store.getRouteSessionById(requestedSessionId)
    : null;
  const positionTime = new Date(processedTimestamp);
  const historicalSession = requestedSessionId && !requestedSession && !Number.isNaN(positionTime.getTime())
    ? (await store.listRouteSessions({ vehicleId, limit: 50 })).find((session) =>
        positionTime.getTime() >= new Date(session.startedAt).getTime() &&
        (!session.finishedAt || positionTime.getTime() <= new Date(session.finishedAt).getTime())
      ) || null
    : null;
  // Si el cliente envio una identidad explicita que ya no existe (por ejemplo
  // `pending:*`), la evidencia temporal manda sobre la sesion activa actual.
  // Esto evita atribuir un paquete historico a una jornada posterior.
  return requestedSession || historicalSession || activeSession;
}

function canSessionAcceptPosition(session, vehicleId, requestedSessionId, processedTimestamp) {
  if (!session || session.vehicleId !== vehicleId) return false;
  const positionTime = new Date(processedTimestamp).getTime();
  if (!Number.isFinite(positionTime) || positionTime < new Date(session.startedAt).getTime()) return false;
  if (session.finishedAt && positionTime > new Date(session.finishedAt).getTime()) return false;
  return session.status === "RUNNING" || (
    Boolean(requestedSessionId) && ["PAUSED", "FINISHED"].includes(session.status)
  );
}

async function emitLocationUpdate({ io, store, vehicle, publicUpdate, organizationId }) {
  await emitOperationalUnitUpdate({
    io,
    store,
    vehicle: publicUpdate,
    organizationId,
    getRolesWithPermission
  });
}

/**
 * Unico predicado de propiedad para PUBLICAR telemetria GPS.
 *
 * Publicar la posicion de una unidad no es administrarla: es afirmar donde esta
 * fisicamente el vehiculo. Solo puede hacerlo el actor que lo opera, es decir
 * aquel al que la unidad esta asignada.
 *
 * Se expresa como identidad de asignacion y no como tabla de roles a proposito.
 * El modelo de datos ya garantiza que solo un conductor recibe `vehicleId`
 * (`data/store.js` y `data/mongo-store.js` fuerzan
 * `role === "driver" ? payload.vehicleId : null`, y `changeDriverVehicle` filtra
 * por `role: "driver"`), asi que la propiedad implica el rol sin necesidad de
 * enumerarlo aqui.
 *
 * Ver/administrar tracking es otra autoridad y no pasa por aqui: la lectura va
 * por `/locations/live` con `canViewAnalytics` y la administracion de rutas y
 * asignaciones por `canManageRoutes`. Ninguna de las dos se ve afectada.
 */
function canPublishVehicleTelemetry(actor, vehicleId) {
  const assignedVehicleId = String(actor?.vehicleId || "").trim();
  return Boolean(assignedVehicleId) && assignedVehicleId === String(vehicleId || "").trim();
}

async function ingestVehicleLocation({ actor, io, payload = {}, requestId = null, store, transport }) {
  const ingestionStartedAt = Date.now();
  incrementMetric("gps_packets_received", 1, { transport });
  const vehicleId = String(payload.vehicleId || "").trim();
  const coordinates = normalizePoint(payload.coordinates);
  const packetId = String(payload.packetId || "").trim() || null;
  const requestedSessionId = String(payload.sessionId || "").trim() || null;
  const heading = finiteOrNull(payload.heading ?? payload.coordinates?.heading);
  const speed = finiteOrNull(payload.speed ?? payload.coordinates?.speed);
  const accuracy = finiteOrNull(payload.accuracy ?? payload.coordinates?.accuracy);
  const quality = classifyGpsQuality(accuracy);
  if (!actor || !vehicleId || !coordinates) {
    throw new LocationIngestionError(400, "invalid_payload", "vehicleId y coordinates son obligatorios");
  }

  const vehicle = await store.getVehicleById(vehicleId);
  if (!vehicle) throw new LocationIngestionError(404, "vehicle_not_found", "Unidad no encontrada");
  if (!canAccessTenantResource(actor, vehicle)) {
    throw new LocationIngestionError(403, "cross_tenant_vehicle", "No puedes actualizar unidades de otra organizacion");
  }
  if (!canPublishVehicleTelemetry(actor, vehicleId)) {
    throw new LocationIngestionError(403, "forbidden_vehicle", "No puedes actualizar la ubicacion de otra unidad");
  }

  const scheduleState = getOperationalScheduleState(actor.operationalSchedule);
  if (scheduleState.isConfigured && !scheduleState.isWithinSchedule && !requestedSessionId) {
    throw new LocationIngestionError(409, "outside_operational_schedule", "GPS pausado fuera del horario operativo");
  }

  // La posicion y la prueba de vida son dos autoridades distintas. Un paquete
  // dentro del radio de jitter conserva la ultima coordenada estable, pero se
  // persiste igualmente con timestamp/recepcion nuevos. Asi el pin no "baila"
  // estando detenido y `connectionState` sigue pasando en tiempo real por
  // live -> delayed/stale/lost si dejan de llegar paquetes.
  const positionDecision = stabilizeGpsPosition(vehicle.location, coordinates);
  const liveCoordinates = positionDecision.coordinates;

  // `clientQueueAgeMs` is an elapsed-duration signal produced at send time by
  // the client queue. Unlike the device wall clock, elapsed queue age can tell
  // us that a packet was captured long ago even when the phone clock is skewed.
  const temporal = normalizeTrackingTime(
    payload.timestamp,
    new Date(),
    payload.clientQueueAgeMs
  );
  logger.info({
    module: "Tracking",
    action: "location.temporal_decision",
    requestId,
    userId: actor.id,
    organizationId: getOrganizationId(actor),
    status: temporal.discardReason ? "normalized" : "accepted",
    metadata: {
      vehicleId,
      packetId,
      origin: transport,
      positionKind: positionDecision.kind,
      positionDistanceMeters: positionDecision.distanceMeters,
      positionStabilized: positionDecision.stabilized,
      ...temporal
    }
  });
  if (Number.isFinite(temporal.clientQueueAgeMs)) {
    observeDuration("gps_transport_queue_age_ms", temporal.clientQueueAgeMs, {
      decision: temporal.discardReason || "accepted",
      transport
    });
  }

  const update = await store.updateVehicleLocation({
    vehicleId,
    coordinates: liveCoordinates,
    heading,
    speed,
    timestamp: temporal.processedTimestamp,
    temporal,
    packetId
  });
  const decision = update?.locationUpdateReason || "accepted";
  if (update?.locationUpdateApplied === false) {
    incrementMetric(decision === "duplicate" ? "gps_packets_duplicate" : "gps_packets_out_of_order", 1, { transport });
    incrementMetric("gps_packets_rejected", 1, { reason: decision, transport });
    if (decision === "duplicate") {
      observeDuration("gps_ingestion_duration_ms", Date.now() - ingestionStartedAt, {
        decision,
        quality,
        transport
      });
      return {
        accepted: false,
        decision,
        packetId,
        positionDecision,
        publicUpdate: { ...update, gpsFreshness: buildGpsFreshness(update) },
        temporal,
        vehicleId
      };
    }
  }

  const trackingSession = await resolveTrackingSession(store, vehicleId, requestedSessionId, temporal.processedTimestamp);
  if (canSessionAcceptPosition(trackingSession, vehicleId, requestedSessionId, temporal.processedTimestamp)) {
    // Un paquete historico/out-of-order conserva su coordenada capturada para
    // reconstruccion de jornada. Solo la proyeccion viva se estabiliza.
    const sessionCoordinates = update.locationUpdateApplied === false ? coordinates : liveCoordinates;
    const position = await store.createRouteSessionPosition({
      organizationId: String(vehicle.organizationId || getOrganizationId(actor)).trim(),
      sessionId: trackingSession.id,
      vehicleId,
      packetId,
      latitude: sessionCoordinates.latitude,
      longitude: sessionCoordinates.longitude,
      timestamp: temporal.processedTimestamp,
      heading,
      speed,
      accuracy,
      gpsQuality: quality
    });
    if (position.duplicateSkipped) {
      incrementMetric("gps_packets_duplicate", 1, { transport });
    } else if (trackingSession.status === "RUNNING" && update.locationUpdateApplied !== false) {
      await processRoutePosition({
        store,
        session: trackingSession,
        vehicle: update,
        position,
        routeProgress: update.activeRouteProgress || null
      });
    } else if (trackingSession.status === "FINISHED") {
      await calculateAndPersistRouteMetrics(store, trackingSession.id);
    }
  }

  if (update.locationUpdateApplied === false) {
    observeDuration("gps_ingestion_duration_ms", Date.now() - ingestionStartedAt, {
      decision,
      quality,
      transport
    });
    return {
      accepted: false,
      decision,
      packetId,
      positionDecision,
      publicUpdate: { ...update, gpsFreshness: buildGpsFreshness(update) },
      temporal,
      vehicleId
    };
  }

  const publicUpdate = { ...update, gpsFreshness: buildGpsFreshness(update) };
  const organizationId = String(vehicle.organizationId || getOrganizationId(actor)).trim();
  await emitLocationUpdate({ io, store, vehicle, publicUpdate, organizationId });
  incrementMetric("gps_packets_accepted", 1, { transport });
  observeDuration("gps_ingestion_duration_ms", Date.now() - ingestionStartedAt, {
    decision: "accepted",
    quality,
    transport
  });
  return {
    accepted: true,
    decision: "accepted",
    packetId,
    positionDecision,
    publicUpdate,
    temporal,
    vehicleId
  };
}

module.exports = {
  LocationIngestionError,
  canPublishVehicleTelemetry,
  ingestVehicleLocation,
  normalizePoint
};
