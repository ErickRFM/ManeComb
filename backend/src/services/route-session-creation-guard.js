const { transitionJourneySession, JourneyTransitionError } = require("./journey-transition-service");
const { recordSessionEvent } = require("./route-event-engine");

const GUARDED_STORE = Symbol.for("manecomb.route-session-creation-guard");
const ACTIVE_SESSION_STATUSES = new Set(["ASSIGNED", "READY", "RUNNING", "PAUSED"]);

class RouteSessionCreationGuardError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "RouteSessionCreationGuardError";
    this.code = code;
    this.statusCode = 409;
    this.publicMessage = message;
    this.details = details;
  }
}

function normalize(value) {
  return String(value ?? "").trim();
}

function isDriverEligibleForSession(user, payload = {}) {
  if (!user || normalize(user.role).toLowerCase() !== "driver") return false;
  if (normalize(user.userStatus || "active").toLowerCase() !== "active") return false;
  if (normalize(user.vehicleId) !== normalize(payload.vehicleId)) return false;

  const userOrganizationId = normalize(user.organizationId);
  const sessionOrganizationId = normalize(payload.organizationId);
  if (userOrganizationId && sessionOrganizationId && userOrganizationId !== sessionOrganizationId) {
    return false;
  }

  return normalize(user.id || user._id) === normalize(payload.driverId);
}

async function getDriver(store, driverId) {
  if (!driverId || typeof store?.getUserById !== "function") return null;
  return await Promise.resolve(store.getUserById(driverId));
}

async function cancelSessionCreatedDuringOffboard(store, session, payload) {
  if (!session?.id) return null;

  const actor = {
    id: "system:route-session-creation-guard",
    role: "admin",
    organizationId: normalize(payload.organizationId || session.organizationId)
  };
  const finishReason = "Jornada cancelada porque el conductor cambió de estado durante el inicio.";

  try {
    const transition = await transitionJourneySession({
      store,
      sessionId: session.id,
      actor,
      nextStatus: "CANCELLED",
      finishReason
    });

    if (transition.applied) {
      await recordSessionEvent(store, transition.session, "SESSION_FINISHED", {
        previousStatus: transition.previousStatus,
        nextStatus: "CANCELLED",
        updatedBy: actor.id,
        finishReason: transition.session.finishReason || finishReason,
        source: "driver_lifecycle_guard"
      });
    }
    return transition.session;
  } catch (error) {
    if (error instanceof JourneyTransitionError) {
      const latest = await Promise.resolve(store.getRouteSessionById(session.id));
      if (!latest || !ACTIVE_SESSION_STATUSES.has(normalize(latest.status).toUpperCase())) {
        return latest || null;
      }
    }
    throw error;
  }
}

function assertEligible(user, payload, stage) {
  if (isDriverEligibleForSession(user, payload)) return;
  throw new RouteSessionCreationGuardError(
    "driver_lifecycle_changed",
    "El conductor cambió de estado o asignación mientras se iniciaba la jornada. Actualiza e intenta de nuevo.",
    {
      stage,
      driverId: normalize(payload.driverId),
      vehicleId: normalize(payload.vehicleId)
    }
  );
}

function installRouteSessionCreationGuard(store) {
  if (!store || typeof store.createRouteSession !== "function") return store;
  if (store[GUARDED_STORE]) return store;

  const createRouteSession = store.createRouteSession.bind(store);

  Object.defineProperty(store, GUARDED_STORE, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });

  store.createRouteSession = async (payload = {}) => {
    const driverId = normalize(payload.driverId);
    if (!driverId) return await createRouteSession(payload);

    const before = await getDriver(store, driverId);
    assertEligible(before, payload, "before_create");

    const session = await createRouteSession(payload);
    if (session?.creationApplied === false) return session;

    const after = await getDriver(store, driverId);
    if (isDriverEligibleForSession(after, payload)) return session;

    await cancelSessionCreatedDuringOffboard(store, session, payload);
    assertEligible(after, payload, "after_create");
    return session;
  };

  return store;
}

module.exports = {
  RouteSessionCreationGuardError,
  installRouteSessionCreationGuard,
  isDriverEligibleForSession
};
