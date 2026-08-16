const core = require("./auto-route-learning-core");
const config = require("../config/auto-route");
const { isTechnicalRouteId } = require("../domain/route-context");
const { incrementMetric } = require("./metrics");

async function rejectUnavailableOfficialRoute(store, session) {
  const claim = await store.claimAutoRouteProcessing({
    sessionId: session.id,
    organizationId: session.organizationId,
    algorithmVersion: config.segmentAlgorithmVersion
  });
  if (!claim?.claimed) {
    return { processed: false, reason: "already_processed", processing: claim };
  }
  await store.completeAutoRouteProcessing(claim.id, {
    status: "REJECTED",
    reason: "official_route_unavailable"
  });
  incrementMetric("auto_route_segment_context_rejected", 1, { reason: "official_route_unavailable" });
  return {
    processed: true,
    eligible: false,
    segmentLearning: true,
    reason: "official_route_unavailable"
  };
}

/**
 * Boundary guard for V3. A session that started against an official Route must
 * never fall back to the V2 full-route learner merely because that Route was
 * deleted or became inaccessible before post-processing.
 */
async function processCompletedRouteSession(store, sessionId) {
  if (config.learningEnabled && config.segmentLearningEnabled) {
    const session = await store.getRouteSessionById(sessionId);
    if (session && !isTechnicalRouteId(session.routeId)) {
      const route = await store.getRouteById(session.routeId);
      if (!route || String(route.organizationId || "") !== String(session.organizationId || "")) {
        return rejectUnavailableOfficialRoute(store, session);
      }
    }
  }
  return core.processCompletedRouteSession(store, sessionId);
}

module.exports = {
  ...core,
  processCompletedRouteSession
};
