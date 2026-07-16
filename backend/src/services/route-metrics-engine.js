const STOPPED_SPEED_THRESHOLD_MPS = Math.max(0, Number(process.env.ROUTE_STOPPED_SPEED_MPS) || 0.8);

function toDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function secondsBetween(start, end) {
  return Math.max(0, Math.round((toDate(end).getTime() - toDate(start).getTime()) / 1000));
}

function toPoint(position) {
  const latitude = Number(position?.latitude);
  const longitude = Number(position?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function distanceInMeters(origin, destination) {
  if (!origin || !destination) {
    return 0;
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

function normalizeSpeed(speed) {
  const value = Number(speed);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return value > 45 ? value / 3.6 : value;
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null;
}

function percentile(values, percentileValue) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);

  if (!sorted.length) {
    return null;
  }

  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

function roundMetric(value, decimals = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : null;
}

function sumPairedDurations(events, startType, endType, fallbackEndAt) {
  let activeStart = null;
  let totalSeconds = 0;
  let longestSeconds = 0;
  let count = 0;

  events.forEach((event) => {
    if (event.eventType === startType && !activeStart) {
      activeStart = event;
      count += 1;
      return;
    }

    if (event.eventType === endType && activeStart) {
      const duration = secondsBetween(activeStart.timestamp, event.timestamp);
      totalSeconds += duration;
      longestSeconds = Math.max(longestSeconds, duration);
      activeStart = null;
    }
  });

  if (activeStart && fallbackEndAt) {
    const duration = secondsBetween(activeStart.timestamp, fallbackEndAt);
    totalSeconds += duration;
    longestSeconds = Math.max(longestSeconds, duration);
  }

  return {
    count,
    longestSeconds,
    totalSeconds
  };
}

function getCheckpointNumber(checkpointId) {
  const match = String(checkpointId || "").match(/(\d+)$/);
  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

function calculateLapMetrics(visits) {
  const ordered = [...visits].sort((left, right) => {
    const leftOrder = Number(left.visitOrder) || 0;
    const rightOrder = Number(right.visitOrder) || 0;
    return leftOrder - rightOrder || toDate(left.timestamp) - toDate(right.timestamp);
  });
  const checkpointNumbers = ordered.map((visit) => getCheckpointNumber(visit.checkpointId)).filter(Boolean);
  const checkpointCount = checkpointNumbers.length ? Math.max(...checkpointNumbers) : 0;

  if (!checkpointCount) {
    return {
      checkpointCount: 0,
      completedCheckpoints: 0,
      completedLaps: 0,
      incompleteLaps: 0,
      compliancePercent: 0
    };
  }

  let expected = 1;
  let completedLaps = 0;
  let currentLapVisited = 0;

  checkpointNumbers.forEach((checkpointNumber) => {
    if (checkpointNumber !== expected) {
      if (checkpointNumber === 1) {
        expected = 2;
        currentLapVisited = 1;
      }
      return;
    }

    currentLapVisited += 1;

    if (checkpointNumber === checkpointCount) {
      completedLaps += 1;
      expected = 1;
      currentLapVisited = 0;
      return;
    }

    expected += 1;
  });

  const incompleteLaps = currentLapVisited > 0 ? 1 : 0;
  const targetCheckpoints = Math.max(checkpointCount, (completedLaps + incompleteLaps) * checkpointCount);

  return {
    checkpointCount,
    completedCheckpoints: checkpointNumbers.length,
    completedLaps,
    incompleteLaps,
    compliancePercent: targetCheckpoints ? roundMetric((checkpointNumbers.length / targetCheckpoints) * 100, 2) : 0
  };
}

function calculateDistance(positions) {
  let total = 0;

  for (let index = 1; index < positions.length; index += 1) {
    total += distanceInMeters(toPoint(positions[index - 1]), toPoint(positions[index]));
  }

  return total;
}

function getQualityBreakdown(positions) {
  const total = positions.length || 0;
  const counts = { GOOD: 0, NORMAL: 0, BAD: 0 };

  positions.forEach((position) => {
    const quality = ["GOOD", "NORMAL", "BAD"].includes(position.gpsQuality) ? position.gpsQuality : "NORMAL";
    counts[quality] += 1;
  });

  return {
    badPercent: total ? roundMetric((counts.BAD / total) * 100, 2) : 0,
    goodPercent: total ? roundMetric((counts.GOOD / total) * 100, 2) : 0,
    normalPercent: total ? roundMetric((counts.NORMAL / total) * 100, 2) : 0,
    counts
  };
}

function buildMetrics({ events, positions, session, visits }) {
  const orderedPositions = [...positions].sort((left, right) => toDate(left.timestamp) - toDate(right.timestamp));
  const orderedEvents = [...events].sort((left, right) => toDate(left.timestamp) - toDate(right.timestamp));
  const finishedAt = session.finishedAt || new Date().toISOString();
  const totalDuration = secondsBetween(session.startedAt, finishedAt);
  const stopped = sumPairedDurations(orderedEvents, "VEHICLE_STOPPED", "VEHICLE_MOVING", finishedAt);
  const paused = sumPairedDurations(orderedEvents, "SESSION_PAUSED", "SESSION_RESUMED", finishedAt);
  const gpsLost = sumPairedDurations(orderedEvents, "GPS_LOST", "GPS_RECOVERED", finishedAt);
  const offRoute = sumPairedDurations(orderedEvents, "OFF_ROUTE", "ON_ROUTE", finishedAt);
  const speeds = orderedPositions.map((position) => normalizeSpeed(position.speed)).filter((speed) => speed !== null);
  const accuracies = orderedPositions
    .map((position) => Number(position.accuracy))
    .filter((accuracy) => Number.isFinite(accuracy));
  const quality = getQualityBreakdown(orderedPositions);
  const laps = calculateLapMetrics(visits);
  const totalDistance = calculateDistance(orderedPositions);
  const movingTime = Math.max(0, totalDuration - stopped.totalSeconds - paused.totalSeconds);
  const effectiveTimePercent = totalDuration ? roundMetric((movingTime / totalDuration) * 100, 2) : 0;
  const gpsCoveragePercent = totalDuration
    ? roundMetric(((totalDuration - gpsLost.totalSeconds) / totalDuration) * 100, 2)
    : 0;

  return {
    totalDistance: roundMetric(totalDistance),
    totalDuration,
    movingTime,
    stoppedTime: stopped.totalSeconds,
    gpsLostTime: gpsLost.totalSeconds,
    offRouteTime: offRoute.totalSeconds,
    checkpointCount: laps.checkpointCount,
    completedCheckpoints: laps.completedCheckpoints,
    completedLaps: laps.completedLaps,
    averageSpeed: roundMetric(average(speeds)),
    maxSpeed: speeds.length ? roundMetric(Math.max(...speeds)) : null,
    averageGpsAccuracy: roundMetric(average(accuracies)),
    gpsLostEvents: gpsLost.count,
    offRouteEvents: offRoute.count,
    stopEvents: stopped.count,
    processingCompletedAt: new Date().toISOString(),
    processingError: null,
    statisticsReady: true,
    processingStatus: "COMPLETED",
    metrics: {
      averageGpsAccuracy: roundMetric(average(accuracies)),
      averageSpeed: roundMetric(average(speeds)),
      completedCheckpoints: laps.completedCheckpoints,
      completedLaps: laps.completedLaps,
      compliancePercent: laps.compliancePercent,
      effectiveTimePercent,
      gpsCoveragePercent,
      gpsQuality: quality,
      incompleteLaps: laps.incompleteLaps,
      longestOffRouteSeconds: offRoute.longestSeconds,
      longestStopSeconds: stopped.longestSeconds,
      maxSpeed: speeds.length ? roundMetric(Math.max(...speeds)) : null,
      minSpeed: speeds.length ? roundMetric(Math.min(...speeds)) : null,
      p95Speed: roundMetric(percentile(speeds, 95)),
      positionCount: orderedPositions.length,
      pausedTime: paused.totalSeconds,
      stoppedSpeedThresholdMetersPerSecond: STOPPED_SPEED_THRESHOLD_MPS,
      totalDistance: roundMetric(totalDistance),
      totalDuration
    }
  };
}

async function calculateAndPersistRouteMetrics(store, sessionId) {
  const session = await store.getRouteSessionById(sessionId);

  if (!session) {
    throw new Error("Jornada no encontrada");
  }

  await store.updateRouteSession(session.id, {
    processingStatus: "PROCESSING",
    statisticsReady: false,
    processingError: null
  });

  try {
    const [positions, events, visits] = await Promise.all([
      store.listRouteSessionPositions({ sessionId: session.id, limit: 50000 }),
      store.listRouteEvents({ sessionId: session.id, limit: 50000 }),
      store.listCheckpointVisits({ sessionId: session.id, limit: 50000 })
    ]);
    const metrics = buildMetrics({ events, positions, session, visits });

    return await store.updateRouteSession(session.id, metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible calcular metricas";
    await store.updateRouteSession(session.id, {
      processingStatus: "FAILED",
      statisticsReady: false,
      processingError: message
    });
    throw error;
  }
}

module.exports = {
  buildMetrics,
  calculateAndPersistRouteMetrics
};
