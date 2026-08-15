function positiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

module.exports = Object.freeze({
  onRouteMeters: positiveNumber("ROUTE_CORRIDOR_ON_ROUTE_METERS", 65),
  nearRouteMeters: positiveNumber("ROUTE_CORRIDOR_NEAR_ROUTE_METERS", 120),
  possibleDeviationMeters: positiveNumber("ROUTE_CORRIDOR_POSSIBLE_DEVIATION_METERS", 220),
  hardDeviationMeters: positiveNumber("ROUTE_CORRIDOR_HARD_DEVIATION_METERS", 650),
  deviationConfirmSeconds: positiveNumber("ROUTE_CORRIDOR_DEVIATION_CONFIRM_SECONDS", 45),
  recoveryMeters: positiveNumber("ROUTE_CORRIDOR_RECOVERY_METERS", 80),
  segmentCandidateMeters: positiveNumber("AUTO_ROUTE_SEGMENT_CANDIDATE_METERS", 90),
  segmentRecoveryMeters: positiveNumber("AUTO_ROUTE_SEGMENT_RECOVERY_METERS", 70),
  segmentMinPoints: Math.max(3, Math.round(positiveNumber("AUTO_ROUTE_SEGMENT_MIN_POINTS", 4))),
  segmentMinDistanceMeters: positiveNumber("AUTO_ROUTE_SEGMENT_MIN_DISTANCE_METERS", 120),
  segmentMinDurationSeconds: positiveNumber("AUTO_ROUTE_SEGMENT_MIN_DURATION_SECONDS", 20),
  segmentAnchorCellMeters: positiveNumber("AUTO_ROUTE_SEGMENT_ANCHOR_CELL_METERS", 120),
  segmentAnchorMatchMeters: positiveNumber("AUTO_ROUTE_SEGMENT_ANCHOR_MATCH_METERS", 180),
  segmentCorridorDistanceMeters: positiveNumber("AUTO_ROUTE_SEGMENT_CORRIDOR_DISTANCE_METERS", 90),
  segmentCorridorOverlap: Math.min(1, positiveNumber("AUTO_ROUTE_SEGMENT_CORRIDOR_OVERLAP", 0.7))
});
