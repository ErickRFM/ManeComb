const { RouteModel } = require("../data/models");
const {
  polylineLengthMeters,
  slicePolyline,
  splicePolylineSegment
} = require("../domain/route-geometry");
const { decodeSegmentGeometryVersion } = require("../domain/learned-route-segment");

function calculateSegmentRouteUpdate(route, candidate, metadata) {
  const routePolyline = Array.isArray(route?.polyline) ? route.polyline : [];
  if (routePolyline.length < 2) return null;
  const baselinePolyline = slicePolyline(
    routePolyline,
    metadata.startDistanceMeters,
    metadata.endDistanceMeters
  );
  const baselineGeometryDistance = polylineLengthMeters(baselinePolyline);
  const routeGeometryDistance = polylineLengthMeters(routePolyline);
  const candidateDistance = Math.max(0, Number(candidate.distanceMeters) || polylineLengthMeters(candidate.polyline));
  const nextPolyline = splicePolylineSegment(
    routePolyline,
    metadata.startDistanceMeters,
    metadata.endDistanceMeters,
    candidate.polyline
  );
  if (nextPolyline.length < 2 || baselineGeometryDistance <= 0 || candidateDistance <= 0) return null;

  const distanceDelta = candidateDistance - baselineGeometryDistance;
  const currentDistance = Math.max(0, Number(route.distanceMeters) || routeGeometryDistance);
  const routeDuration = Math.max(0, Number(route.durationSeconds) || 0);
  const routeTrafficDuration = Math.max(routeDuration, Number(route.durationInTrafficSeconds) || routeDuration);
  const baselineDuration = routeGeometryDistance > 0
    ? routeDuration * baselineGeometryDistance / routeGeometryDistance
    : 0;
  const baselineTrafficDuration = routeGeometryDistance > 0
    ? routeTrafficDuration * baselineGeometryDistance / routeGeometryDistance
    : baselineDuration;
  const candidateDuration = Math.max(1, Number(candidate.durationSeconds) || Math.round(baselineDuration));

  return {
    polyline: nextPolyline,
    distanceMeters: Math.max(1, Math.round(currentDistance + distanceDelta)),
    durationSeconds: Math.max(1, Math.round(routeDuration - baselineDuration + candidateDuration)),
    durationInTrafficSeconds: Math.max(1, Math.round(routeTrafficDuration - baselineTrafficDuration + candidateDuration)),
    baselinePolyline,
    baselineDistanceMeters: Math.round(baselineGeometryDistance),
    baselineDurationSeconds: Math.round(baselineDuration),
    candidateDistanceMeters: Math.round(candidateDistance),
    candidateDurationSeconds: Math.round(candidateDuration),
    distanceDeltaMeters: Math.round(distanceDelta),
    durationDeltaSeconds: Math.round(candidateDuration - baselineDuration)
  };
}

async function applySegmentCandidateToRoute({ store, candidate, actor }) {
  const metadata = decodeSegmentGeometryVersion(candidate?.geometryVersion);
  if (!metadata) return { applied: false, reason: "not_segment_candidate" };
  const current = await store.getRouteById(metadata.routeId);
  if (!current || String(current.organizationId || "") !== String(candidate.organizationId || "")) {
    return { applied: false, reason: "route_not_found", metadata };
  }
  if (Number(current.revision) !== metadata.routeRevision) {
    return { applied: false, reason: "candidate_stale", route: current, metadata };
  }
  const update = calculateSegmentRouteUpdate(current, candidate, metadata);
  if (!update) return { applied: false, reason: "invalid_segment_geometry", route: current, metadata };

  const operationalUpdate = {
    polyline: update.polyline,
    distanceMeters: update.distanceMeters,
    durationSeconds: update.durationSeconds,
    durationInTrafficSeconds: update.durationInTrafficSeconds
  };
  let route = null;

  // Mongo production path: compare-and-swap on Route.revision prevents a manual
  // edit racing the learned-segment approval. The regular store update is then
  // invoked as a no-op to refresh assignedRoute projections with the canonical
  // route that was atomically committed.
  if (RouteModel?.db?.readyState === 1) {
    const atomic = await RouteModel.findOneAndUpdate(
      {
        _id: metadata.routeId,
        organizationId: candidate.organizationId,
        revision: metadata.routeRevision
      },
      {
        $set: {
          ...operationalUpdate,
          revision: metadata.routeRevision + 1,
          updatedAt: new Date()
        }
      },
      { returnDocument: "after" }
    ).lean();
    if (!atomic) {
      return {
        applied: false,
        reason: "candidate_stale",
        route: await store.getRouteById(metadata.routeId),
        metadata
      };
    }
    route = await store.updateRoute(metadata.routeId, {}, actor);
  } else {
    // Embedded/test store is single-process; re-read immediately before the
    // canonical writer and verify the same optimistic token.
    const latest = await store.getRouteById(metadata.routeId);
    if (!latest || Number(latest.revision) !== metadata.routeRevision) {
      return { applied: false, reason: "candidate_stale", route: latest, metadata };
    }
    route = await store.updateRoute(metadata.routeId, operationalUpdate, actor);
  }

  if (!route || Number(route.revision) !== metadata.routeRevision + 1) {
    return { applied: false, reason: "route_update_failed", route, metadata };
  }
  return {
    applied: true,
    route,
    previousRoute: current,
    metadata,
    comparison: {
      baselineDistanceMeters: update.baselineDistanceMeters,
      baselineDurationSeconds: update.baselineDurationSeconds,
      candidateDistanceMeters: update.candidateDistanceMeters,
      candidateDurationSeconds: update.candidateDurationSeconds,
      distanceDeltaMeters: update.distanceDeltaMeters,
      durationDeltaSeconds: update.durationDeltaSeconds
    }
  };
}

module.exports = {
  applySegmentCandidateToRoute,
  calculateSegmentRouteUpdate
};
