const JOURNEY_STATUSES = Object.freeze([
  "ASSIGNED",
  "READY",
  "RUNNING",
  "PAUSED",
  "FINISHED",
  "CANCELLED"
]);

const TERMINAL_JOURNEY_STATUSES = new Set(["FINISHED", "CANCELLED"]);
const ACTIVE_JOURNEY_STATUSES = new Set(["ASSIGNED", "READY", "RUNNING", "PAUSED"]);

const JOURNEY_TRANSITIONS = Object.freeze({
  ASSIGNED: Object.freeze(["READY", "CANCELLED"]),
  READY: Object.freeze(["RUNNING", "CANCELLED"]),
  RUNNING: Object.freeze(["PAUSED", "FINISHED", "CANCELLED"]),
  PAUSED: Object.freeze(["RUNNING", "FINISHED", "CANCELLED"]),
  FINISHED: Object.freeze([]),
  CANCELLED: Object.freeze([])
});

function normalizeJourneyStatus(value) {
  const status = String(value ?? "").trim().toUpperCase();
  return JOURNEY_STATUSES.includes(status) ? status : null;
}

function isJourneyTerminal(value) {
  const status = normalizeJourneyStatus(value);
  return status ? TERMINAL_JOURNEY_STATUSES.has(status) : false;
}

function isJourneyActive(value) {
  const status = normalizeJourneyStatus(value);
  return status ? ACTIVE_JOURNEY_STATUSES.has(status) : false;
}

function canTransitionJourney(currentValue, nextValue) {
  const currentStatus = normalizeJourneyStatus(currentValue);
  const nextStatus = normalizeJourneyStatus(nextValue);

  if (!currentStatus || !nextStatus) {
    return {
      ok: false,
      reason: "invalid_status",
      currentStatus,
      nextStatus
    };
  }

  if (currentStatus === nextStatus) {
    return {
      ok: true,
      idempotent: true,
      currentStatus,
      nextStatus
    };
  }

  if (TERMINAL_JOURNEY_STATUSES.has(currentStatus)) {
    return {
      ok: false,
      reason: "terminal_status",
      currentStatus,
      nextStatus
    };
  }

  if (!JOURNEY_TRANSITIONS[currentStatus].includes(nextStatus)) {
    return {
      ok: false,
      reason: "invalid_transition",
      currentStatus,
      nextStatus
    };
  }

  return {
    ok: true,
    idempotent: false,
    currentStatus,
    nextStatus
  };
}

function resolveJourneyTransitionPatch({
  currentStatus,
  nextStatus,
  actorId,
  now = new Date(),
  finishReason = null,
  finishedOdometer = null,
  endBattery = null,
  endGpsAccuracy = null
}) {
  const decision = canTransitionJourney(currentStatus, nextStatus);

  if (!decision.ok) {
    return decision;
  }

  if (decision.idempotent) {
    return {
      ...decision,
      patch: null
    };
  }

  const changedAt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(changedAt.getTime())) {
    return {
      ok: false,
      reason: "invalid_transition_time",
      currentStatus: decision.currentStatus,
      nextStatus: decision.nextStatus
    };
  }

  const patch = {
    expectedStatus: decision.currentStatus,
    status: decision.nextStatus,
    updatedBy: actorId || null,
    updatedAt: changedAt.toISOString()
  };

  if (decision.currentStatus === "ASSIGNED" && decision.nextStatus === "READY") {
    patch.confirmedAt = changedAt.toISOString();
    patch.confirmedBy = actorId || null;
  }

  if (decision.currentStatus === "READY" && decision.nextStatus === "RUNNING") {
    patch.startedAt = changedAt.toISOString();
    patch.startedBy = actorId || null;
  }

  if (decision.nextStatus === "PAUSED") {
    patch.pausedAt = changedAt.toISOString();
  }

  if (decision.currentStatus === "PAUSED" && decision.nextStatus === "RUNNING") {
    patch.resumedAt = changedAt.toISOString();
  }

  if (TERMINAL_JOURNEY_STATUSES.has(decision.nextStatus)) {
    patch.finishedAt = changedAt.toISOString();
    patch.finishedBy = actorId || null;
    patch.finishReason = String(
      finishReason || (decision.nextStatus === "FINISHED" ? "completed" : "cancelled")
    ).trim();
    patch.finishedOdometer = Number.isFinite(Number(finishedOdometer))
      ? Number(finishedOdometer)
      : null;
    patch.endBattery = Number.isFinite(Number(endBattery)) ? Number(endBattery) : null;
    patch.endGpsAccuracy = Number.isFinite(Number(endGpsAccuracy))
      ? Number(endGpsAccuracy)
      : null;
  }

  return {
    ...decision,
    patch
  };
}

module.exports = {
  JOURNEY_STATUSES,
  JOURNEY_TRANSITIONS,
  ACTIVE_JOURNEY_STATUSES,
  TERMINAL_JOURNEY_STATUSES,
  normalizeJourneyStatus,
  isJourneyActive,
  isJourneyTerminal,
  canTransitionJourney,
  resolveJourneyTransitionPatch
};
