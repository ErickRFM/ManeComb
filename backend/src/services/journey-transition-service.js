const {
  resolveJourneyTransitionPatch
} = require("../domain/journey-lifecycle");

class JourneyTransitionError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "JourneyTransitionError";
    this.code = code;
    this.details = details;
  }
}

function assertStore(store) {
  if (!store || typeof store.getRouteSessionById !== "function" || typeof store.updateRouteSession !== "function") {
    throw new TypeError("journey-transition-service requiere un store de jornadas valido");
  }
}

function assertActorCanTransition(session, actor) {
  if (!actor || !actor.id) {
    throw new JourneyTransitionError("actor_required", "Se requiere un actor autenticado");
  }

  if (actor.role === "driver" && String(session.driverId) !== String(actor.id)) {
    throw new JourneyTransitionError(
      "driver_mismatch",
      "Solo el conductor asignado puede cambiar esta jornada"
    );
  }

  if (
    actor.organizationId &&
    session.organizationId &&
    String(actor.organizationId) !== String(session.organizationId)
  ) {
    throw new JourneyTransitionError(
      "tenant_mismatch",
      "La jornada no pertenece a la organizacion del actor"
    );
  }
}

async function transitionJourneySession({
  store,
  sessionId,
  actor,
  nextStatus,
  now = new Date(),
  finishReason = null,
  finishedOdometer = null,
  endBattery = null,
  endGpsAccuracy = null
}) {
  assertStore(store);

  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedSessionId) {
    throw new JourneyTransitionError("session_id_required", "sessionId es obligatorio");
  }

  const session = await store.getRouteSessionById(normalizedSessionId);
  if (!session) {
    throw new JourneyTransitionError("session_not_found", "Jornada no encontrada");
  }

  assertActorCanTransition(session, actor);

  const decision = resolveJourneyTransitionPatch({
    currentStatus: session.status,
    nextStatus,
    actorId: actor.id,
    now,
    finishReason,
    finishedOdometer,
    endBattery,
    endGpsAccuracy
  });

  if (!decision.ok) {
    throw new JourneyTransitionError(
      decision.reason,
      decision.reason === "terminal_status"
        ? "La jornada ya esta cerrada"
        : "Transicion de jornada invalida",
      {
        currentStatus: decision.currentStatus,
        nextStatus: decision.nextStatus
      }
    );
  }

  if (decision.idempotent) {
    return {
      applied: false,
      idempotent: true,
      previousStatus: session.status,
      session
    };
  }

  const updated = await store.updateRouteSession(session.id, decision.patch);
  if (!updated) {
    throw new JourneyTransitionError(
      "concurrent_transition",
      "La jornada cambio mientras se procesaba la solicitud"
    );
  }

  const transitionApplied = updated.transitionApplied !== false;
  const { transitionApplied: ignored, ...publicSession } = updated;

  if (!transitionApplied) {
    const current = await store.getRouteSessionById(session.id);
    if (current && String(current.status).toUpperCase() === decision.nextStatus) {
      return {
        applied: false,
        idempotent: true,
        previousStatus: session.status,
        session: current
      };
    }

    throw new JourneyTransitionError(
      "concurrent_transition",
      "La jornada cambio mientras se procesaba la solicitud"
    );
  }

  return {
    applied: true,
    idempotent: false,
    previousStatus: session.status,
    session: publicSession,
    patch: decision.patch
  };
}

module.exports = {
  JourneyTransitionError,
  transitionJourneySession
};
