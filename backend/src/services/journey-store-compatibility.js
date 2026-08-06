const { ACTIVE_JOURNEY_STATUSES } = require("../domain/journey-lifecycle");

const JOURNEY_STORE_GUARD = Symbol.for("manecomb.journeyStoreGuard");

function selectActiveSession(sessions = []) {
  return sessions
    .filter((session) => ACTIVE_JOURNEY_STATUSES.has(String(session?.status || "").toUpperCase()))
    .sort((left, right) => {
      const priority = { RUNNING: 0, PAUSED: 1, READY: 2, ASSIGNED: 3 };
      const leftStatus = String(left.status || "").toUpperCase();
      const rightStatus = String(right.status || "").toUpperCase();
      const statusDelta = (priority[leftStatus] ?? 99) - (priority[rightStatus] ?? 99);
      if (statusDelta) return statusDelta;
      const leftTime = new Date(left.startedAt || left.scheduledStartAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.startedAt || right.scheduledStartAt || right.createdAt || 0).getTime();
      return rightTime - leftTime;
    })[0] || null;
}

function ensureJourneyStoreCompatibility(store) {
  if (!store || store[JOURNEY_STORE_GUARD]) return store;
  if (typeof store.listRouteSessions !== "function" || typeof store.createRouteSession !== "function") {
    throw new TypeError("El store no soporta compatibilidad de jornadas");
  }

  const originalCreateRouteSession = store.createRouteSession.bind(store);
  const originalGetActiveRouteSession = typeof store.getActiveRouteSession === "function"
    ? store.getActiveRouteSession.bind(store)
    : null;

  store.getActiveRouteSession = async function getCanonicalActiveRouteSession(vehicleId) {
    const sessions = await store.listRouteSessions({ vehicleId: String(vehicleId || "").trim(), limit: 5000 });
    const active = selectActiveSession(sessions);
    if (active) return active;
    return originalGetActiveRouteSession ? originalGetActiveRouteSession(vehicleId) : null;
  };

  store.createRouteSession = async function createCanonicalRouteSession(payload = {}) {
    const vehicleId = String(payload.vehicleId || "").trim();
    if (vehicleId) {
      const sessions = await store.listRouteSessions({ vehicleId, limit: 5000 });
      const active = selectActiveSession(sessions);
      if (active) return { ...active, creationApplied: false };
    }
    return originalCreateRouteSession(payload);
  };

  Object.defineProperty(store, JOURNEY_STORE_GUARD, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  return store;
}

module.exports = {
  ensureJourneyStoreCompatibility,
  selectActiveSession
};
