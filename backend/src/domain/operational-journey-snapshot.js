const { ACTIVE_JOURNEY_STATUSES, normalizeJourneyStatus } = require("./journey-lifecycle");
const { serializeJourneySession } = require("./journey-session-compatibility");

function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildOperationalJourneySnapshot(session, now = new Date()) {
  if (!session) return null;

  const status = normalizeJourneyStatus(session.status);
  if (!status || !ACTIVE_JOURNEY_STATUSES.has(status)) return null;

  const serialized = serializeJourneySession(session);
  const nowDate = toDate(now) || new Date();
  const startedAt = toDate(serialized.startedAt);
  const elapsedSeconds = startedAt && ["RUNNING", "PAUSED"].includes(status)
    ? Math.max(0, Math.round((nowDate.getTime() - startedAt.getTime()) / 1000))
    : null;

  return {
    id: String(serialized.id || serialized._id || ""),
    status,
    driverId: serialized.driverId ? String(serialized.driverId) : null,
    vehicleId: serialized.vehicleId ? String(serialized.vehicleId) : null,
    routeId: serialized.routeId ? String(serialized.routeId) : null,
    scheduledStartAt: serialized.scheduledStartAt,
    scheduledEndAt: serialized.scheduledEndAt,
    confirmedAt: serialized.confirmedAt,
    confirmedBy: serialized.confirmedBy ? String(serialized.confirmedBy) : null,
    startedAt: serialized.startedAt,
    pausedAt: serialized.pausedAt,
    resumedAt: serialized.resumedAt,
    elapsedSeconds,
    requiresDriverConfirmation: status === "ASSIGNED",
    canStart: status === "READY",
    isDriving: status === "RUNNING",
    isPaused: status === "PAUSED",
    legacyTiming: serialized.legacyTiming
  };
}

function attachOperationalJourney(snapshot, session, now = new Date()) {
  if (!snapshot) return snapshot;
  return {
    ...snapshot,
    journey: buildOperationalJourneySnapshot(session, now),
    snapshotVersion: 2
  };
}

module.exports = {
  attachOperationalJourney,
  buildOperationalJourneySnapshot
};
