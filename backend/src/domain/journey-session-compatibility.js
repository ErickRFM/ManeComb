const { normalizeJourneyStatus } = require("./journey-lifecycle");

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function serializeJourneySession(session) {
  if (!session) return null;

  const status = normalizeJourneyStatus(session.status) || "RUNNING";
  const startedAt = toIsoOrNull(session.startedAt);
  const scheduledStartAt = toIsoOrNull(session.scheduledStartAt);
  const scheduledEndAt = toIsoOrNull(session.scheduledEndAt);

  return {
    ...session,
    status,
    scheduledStartAt,
    scheduledEndAt,
    confirmedAt: toIsoOrNull(session.confirmedAt),
    startedAt,
    pausedAt: toIsoOrNull(session.pausedAt),
    resumedAt: toIsoOrNull(session.resumedAt),
    finishedAt: toIsoOrNull(session.finishedAt),
    reviewedAt: toIsoOrNull(session.reviewedAt),
    closedAt: toIsoOrNull(session.closedAt),
    legacyTiming:
      !scheduledStartAt && startedAt && ["ASSIGNED", "READY"].includes(status)
        ? {
            inferredScheduledStartAt: startedAt,
            reason: "legacy_started_at_used_as_schedule"
          }
        : null
  };
}

function buildLegacyJourneyMigrationPatch(session) {
  const serialized = serializeJourneySession(session);
  if (!serialized) return null;

  const patch = {};

  if (
    !serialized.scheduledStartAt &&
    serialized.startedAt &&
    ["ASSIGNED", "READY"].includes(serialized.status)
  ) {
    patch.scheduledStartAt = serialized.startedAt;
    patch.startedAt = null;
    patch.timingMigrationVersion = 1;
  }

  if (
    serialized.startedAt &&
    ["RUNNING", "PAUSED", "FINISHED", "CANCELLED"].includes(serialized.status) &&
    session.timingMigrationVersion == null
  ) {
    patch.timingMigrationVersion = 1;
  }

  return Object.keys(patch).length ? patch : null;
}

module.exports = {
  buildLegacyJourneyMigrationPatch,
  serializeJourneySession,
  toIsoOrNull
};
