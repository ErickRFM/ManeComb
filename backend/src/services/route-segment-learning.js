const base = require("./route-segment-learning-base");
const { routeContextMatches } = require("../domain/route-context");

/**
 * La geometría de evidencia solo puede compararse contra la misma Route que
 * existía al arrancar la jornada. `SESSION_STARTED.metadata.routeContext` es el
 * snapshot inmutable del token revision + hash.
 */
async function persistDeviationSegments(args) {
  const { store, session, route } = args;
  if (!store?.getLastRouteEvent || !session?.id) return [];
  const startedEvent = await store.getLastRouteEvent(session.id, "SESSION_STARTED");
  if (!routeContextMatches(startedEvent?.metadata?.routeContext, route)) {
    return [];
  }
  return base.persistDeviationSegments(args);
}

module.exports = {
  ...base,
  persistDeviationSegments
};
