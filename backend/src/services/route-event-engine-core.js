const GPS_LOST_THRESHOLD_MS = Math.max(30_000, Number(process.env.ROUTE_GPS_LOST_MS) || 120_000);
const GPS_CONTINUITY_GAP_MS = Math.max(GPS_LOST_THRESHOLD_MS, Number(process.env.ROUTE_GPS_GAP_MS) || 300_000);
const STOPPED_SPEED_THRESHOLD_MPS = Math.max(0, Number(process.env.ROUTE_STOPPED_SPEED_MPS) || 0.8);
const STOPPED_DURATION_MS = Math.max(30_000, Number(process.env.ROUTE_STOPPED_DURATION_MS) || 120_000);
const CHECKPOINT_REACHED_DISTANCE_METERS = Math.max(10, Number(process.env.ROUTE_CHECKPOINT_DISTANCE_METERS) || 75);

function toDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toIso(value) {
  return toDate(value).toISOString();
}

function toPoint(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
}

function distanceInMeters(origin, destination) {
  if (!origin || !destination) {
    return null;
  }

  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const latitudeA = toRadians(origin.latitude);
  const latitudeB = toRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function classifyGpsQuality(accuracy) {
  const value = Number(accuracy);

  if (!Number.isFinite(value)) {
    return "NORMAL";
  }

  if (value <= 15) {
    return "GOOD";
  }

  if (value <= 50) {
    return "NORMAL";
  }

  return "BAD";
}

function normalizeSpeed(speed) {
  const value = Number(speed);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return value > 45 ? value / 3.6 : value;
}

function getEventBase(session, position, eventType, metadata = {}) {
  return {
    organizationId: session.organizationId,
    sessionId: session.id,
    vehicleId: session.vehicleId,
    routeId: session.routeId,
    driverId: session.driverId,
    eventType,
    timestamp: position?.timestamp || new Date().toISOString(),
    latitude: position?.latitude ?? null,
    longitude: position?.longitude ?? null,
    metadata
  };
}

async function createEvent(store, session, position, eventType, metadata = {}) {
  return await store.createRouteEvent(getEventBase(session, position, eventType, metadata));
}

async function recordSessionEvent(store, session, eventType, metadata = {}) {
  return await createEvent(store, session, null, eventType, metadata);
}

function getRoutePolyline(vehicle) {
  const polyline = vehicle?.assignedRoute?.route?.polyline;
  return Array.isArray(polyline)
    ? polyline
        .map((point) => toPoint(point.latitude, point.longitude))
        .filter(Boolean)
    : [];
}

function getPolylineDistance(polyline) {
  let total = 0;

  for (let index = 1; index < polyline.length; index += 1) {
    total += distanceInMeters(polyline[index - 1], polyline[index]) || 0;
  }

  return total;
}

function getPointAtDistance(polyline, targetDistance) {
  if (!Array.isArray(polyline) || polyline.length < 2) {
    return null;
  }

  let walked = 0;

  for (let index = 1; index < polyline.length; index += 1) {
    const start = polyline[index - 1];
    const end = polyline[index];
    const segment = distanceInMeters(start, end) || 0;

    if (segment <= 0) {
      continue;
    }

    if (walked + segment >= targetDistance) {
      const ratio = Math.max(0, Math.min(1, (targetDistance - walked) / segment));
      return {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio
      };
    }

    walked += segment;
  }

  return polyline[polyline.length - 1] || null;
}

async function isStateActive(store, sessionId, startType, endType) {
  const [startEvent, endEvent] = await Promise.all([
    store.getLastRouteEvent(sessionId, startType),
    store.getLastRouteEvent(sessionId, endType)
  ]);

  if (!startEvent) {
    return false;
  }

  if (!endEvent) {
    return true;
  }

  return toDate(startEvent.timestamp).getTime() > toDate(endEvent.timestamp).getTime();
}

async function processGpsContinuity({ store, session, position }) {
  const positions = await store.listRouteSessionPositions({ sessionId: session.id, limit: 2 });
  const [current, previous] = positions;

  if (!current || !previous) {
    return;
  }

  const gapMs = toDate(current.timestamp).getTime() - toDate(previous.timestamp).getTime();

  if (gapMs < GPS_LOST_THRESHOLD_MS) {
    return;
  }

  await createEvent(store, session, previous, "GPS_LOST", {
    startedAt: toIso(previous.timestamp),
    knownPosition: toPoint(previous.latitude, previous.longitude),
    gapMs,
    thresholdMs: GPS_LOST_THRESHOLD_MS,
    continuityGap: gapMs >= GPS_CONTINUITY_GAP_MS
  });
  await createEvent(store, session, position, "GPS_RECOVERED", {
    recoveredAt: toIso(position.timestamp),
    durationMs: gapMs,
    previousPositionAt: toIso(previous.timestamp)
  });
}

async function processRouteDeviation({ store, session, position, routeProgress }) {
  if (!routeProgress || typeof routeProgress.isOffRoute !== "boolean") {
    return;
  }

  const offRouteActive = await isStateActive(store, session.id, "OFF_ROUTE", "ON_ROUTE");

  if (routeProgress.isOffRoute && !offRouteActive) {
    await createEvent(store, session, position, "OFF_ROUTE", {
      startedAt: toIso(position.timestamp),
      distanceFromRoute: Number(routeProgress.distanceFromRoute) || null
    });
    return;
  }

  if (!routeProgress.isOffRoute && offRouteActive) {
    const offRouteEvent = await store.getLastRouteEvent(session.id, "OFF_ROUTE");
    const durationMs = offRouteEvent
      ? toDate(position.timestamp).getTime() - toDate(offRouteEvent.timestamp).getTime()
      : null;
    await createEvent(store, session, position, "ON_ROUTE", {
      recoveredAt: toIso(position.timestamp),
      durationMs,
      distanceFromRoute: Number(routeProgress.distanceFromRoute) || null
    });
  }
}

async function processMovementState({ store, session, position }) {
  const speed = normalizeSpeed(position.speed);
  const stoppedActive = await isStateActive(store, session.id, "VEHICLE_STOPPED", "VEHICLE_MOVING");

  if (speed !== null && speed > STOPPED_SPEED_THRESHOLD_MPS) {
    if (stoppedActive) {
      const stopEvent = await store.getLastRouteEvent(session.id, "VEHICLE_STOPPED");
      const durationMs = stopEvent
        ? toDate(position.timestamp).getTime() - toDate(stopEvent.timestamp).getTime()
        : null;
      await createEvent(store, session, position, "VEHICLE_MOVING", {
        movedAt: toIso(position.timestamp),
        durationMs,
        speedMetersPerSecond: speed
      });
    }
    return;
  }

  if (stoppedActive) {
    return;
  }

  const recent = await store.listRouteSessionPositions({ sessionId: session.id, limit: 25 });
  const slowPositions = [];

  for (const entry of recent) {
    const entrySpeed = normalizeSpeed(entry.speed);
    if (entrySpeed !== null && entrySpeed > STOPPED_SPEED_THRESHOLD_MPS) {
      break;
    }
    slowPositions.push(entry);
  }

  if (slowPositions.length < 2) {
    return;
  }

  const newest = slowPositions[0];
  const oldest = slowPositions[slowPositions.length - 1];
  const durationMs = toDate(newest.timestamp).getTime() - toDate(oldest.timestamp).getTime();

  if (durationMs >= STOPPED_DURATION_MS) {
    await createEvent(store, session, position, "VEHICLE_STOPPED", {
      startedAt: toIso(oldest.timestamp),
      detectedAt: toIso(position.timestamp),
      durationMs,
      speedThresholdMetersPerSecond: STOPPED_SPEED_THRESHOLD_MPS
    });
  }
}

async function processCheckpoints({ store, session, vehicle, position, routeProgress }) {
  const checkpointCount = Number(routeProgress?.checkpointCount) || 0;
  const currentCheckpointIndex = Number(routeProgress?.currentCheckpointIndex) || 0;

  if (checkpointCount <= 0 || currentCheckpointIndex <= 0) {
    return;
  }

  const visits = await store.listCheckpointVisits({ sessionId: session.id, limit: 500 });
  const nextOrder = visits.length + 1;
  const checkpointOrder = Math.min(currentCheckpointIndex, checkpointCount);
  const checkpointId = `checkpoint-${checkpointOrder}`;

  if (visits[visits.length - 1]?.checkpointId === checkpointId) {
    return;
  }

  const polyline = getRoutePolyline(vehicle);
  const totalDistance = getPolylineDistance(polyline);
  const checkpointPoint =
    totalDistance > 0 && checkpointCount > 0
      ? getPointAtDistance(polyline, (totalDistance * checkpointOrder) / checkpointCount)
      : null;
  const currentPoint = toPoint(position.latitude, position.longitude);
  const distance = distanceInMeters(currentPoint, checkpointPoint);

  if (distance !== null && distance > CHECKPOINT_REACHED_DISTANCE_METERS) {
    return;
  }

  const visit = await store.createCheckpointVisit({
    organizationId: session.organizationId,
    sessionId: session.id,
    checkpointId,
    timestamp: position.timestamp,
    distance,
    visitOrder: nextOrder,
    latitude: position.latitude,
    longitude: position.longitude
  });

  if (!visit.duplicateSkipped) {
    await createEvent(store, session, position, "CHECKPOINT_REACHED", {
      checkpointId,
      visitOrder: nextOrder,
      distance,
      checkpointLatitude: checkpointPoint?.latitude ?? null,
      checkpointLongitude: checkpointPoint?.longitude ?? null
    });
  }
}

async function processRoutePosition({ store, session, vehicle, position, routeProgress }) {
  await processGpsContinuity({ store, session, position });
  await processRouteDeviation({ store, session, position, routeProgress });
  await processMovementState({ store, session, position });
  await processCheckpoints({ store, session, vehicle, position, routeProgress });
}

module.exports = {
  classifyGpsQuality,
  processRoutePosition,
  recordSessionEvent
};
