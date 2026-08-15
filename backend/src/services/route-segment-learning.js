const core = require("./route-segment-learning-core");
const { routeContextMatches } = require("../domain/route-context");
const { incrementMetric } = require("./metrics");

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
    incrementMetric("auto_route_segment_context_rejected", 1, { reason: "route_context_mismatch" });
    return [];
  }
  return core.persistDeviationSegments(args);
}

module.exports = {
  ...core,
  persistDeviationSegments
};
