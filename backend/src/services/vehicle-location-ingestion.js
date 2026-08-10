const {
  canAccessTenantResource,
  getOrganizationId,
  getRolesWithPermission
} = require("../middlewares/access-control");
const { emitOperationalUnitUpdate } = require("./operational-units-service");
const { classifyGpsQuality, processRoutePosition } = require("./route-event-engine");
const { calculateAndPersistRouteMetrics } = require("./route-metrics-engine");
const { getOperationalScheduleState } = require("../utils/operational-schedule");
const { buildGpsFreshness, normalizeTrackingTime } = require("./tracking-time");
const { incrementMetric } = require("./metrics");
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
  return requestedSession || activeSession || historicalSession;
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
  if (organizationId) {
    getRolesWithPermission("canViewAnalytics").forEach((role) => {
      io?.to(`org:${organizationId}:role:${role}`).emit("location:updated", publicUpdate);
    });
    if (vehicle.driverId) io?.to(`user:${vehicle.driverId}`).emit("location:updated", publicUpdate);
  }
  io?.to("platform:admin").emit("location:updated", publicUpdate);
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
  incrementMetric("gps_packets_received", 1, { transport });
  const vehicleId = String(payload.vehicleId || "").trim();
  const coordinates = normalizePoint(payload.coordinates);
  const packetId = String(payload.packetId || "").trim() || null;
  const requestedSessionId = String(payload.sessionId || "").trim() || null;
  const heading = finiteOrNull(payload.heading ?? payload.coordinates?.heading);
  const speed = finiteOrNull(payload.speed ?? payload.coordinates?.speed);
  const accuracy = finiteOrNull(payload.accuracy ?? payload.coordinates?.accuracy);
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

  const temporal = normalizeTrackingTime(payload.timestamp);
  logger.info({
    module: "Tracking",
    action: "location.temporal_decision",
    requestId,
    userId: actor.id,
    organizationId: getOrganizationId(actor),
    status: temporal.discardReason ? "normalized" : "accepted",
    metadata: { vehicleId, packetId, origin: transport, ...temporal }
  });

  const update = await store.updateVehicleLocation({
    vehicleId,
    coordinates,
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
      return {
        accepted: false,
        decision,
        packetId,
        publicUpdate: { ...update, gpsFreshness: buildGpsFreshness(update.locationTimestamp) },
        temporal,
        vehicleId
      };
    }
  }

  const trackingSession = await resolveTrackingSession(store, vehicleId, requestedSessionId, temporal.processedTimestamp);
  if (canSessionAcceptPosition(trackingSession, vehicleId, requestedSessionId, temporal.processedTimestamp)) {
    const position = await store.createRouteSessionPosition({
      organizationId: String(vehicle.organizationId || getOrganizationId(actor)).trim(),
      sessionId: trackingSession.id,
      vehicleId,
      packetId,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      timestamp: temporal.processedTimestamp,
      heading,
      speed,
      accuracy,
      gpsQuality: classifyGpsQuality(accuracy)
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
    return {
      accepted: false,
      decision,
      packetId,
      publicUpdate: { ...update, gpsFreshness: buildGpsFreshness(update.locationTimestamp) },
      temporal,
      vehicleId
    };
  }

  const publicUpdate = { ...update, gpsFreshness: buildGpsFreshness(update.locationTimestamp) };
  const organizationId = String(vehicle.organizationId || getOrganizationId(actor)).trim();
  await emitLocationUpdate({ io, store, vehicle, publicUpdate, organizationId });
  incrementMetric("gps_packets_accepted", 1, { transport });
  return { accepted: true, decision: "accepted", packetId, publicUpdate, temporal, vehicleId };
}

module.exports = {
  LocationIngestionError,
  canPublishVehicleTelemetry,
  ingestVehicleLocation,
  normalizePoint
};
