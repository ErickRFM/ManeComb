const core = require("./route-event-engine-core");
const { buildRouteContext, isTechnicalRouteId } = require("../domain/route-context");

async function recordSessionEvent(store, session, eventType, metadata = {}) {
  let nextMetadata = metadata;

  if (eventType === "SESSION_STARTED" && session && !isTechnicalRouteId(session.routeId)) {
    const route = await store.getRouteById(session.routeId);
    const routeContext = buildRouteContext(route);
    if (routeContext) {
      nextMetadata = {
        ...metadata,
        routeContext
      };
    }
  }

  return core.recordSessionEvent(store, session, eventType, nextMetadata);
}

module.exports = {
  ...core,
  recordSessionEvent
};
