function positiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function booleanValue(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

module.exports = Object.freeze({
  algorithmVersion: String(process.env.AUTO_ROUTE_ALGORITHM_VERSION || "v2").trim() || "v2",
  geometryVersion: String(process.env.AUTO_ROUTE_GEOMETRY_VERSION || "corridor-v1").trim() || "corridor-v1",
  learningEnabled: booleanValue("AUTO_ROUTE_LEARNING_ENABLED", false),
  reviewEnabled: booleanValue("AUTO_ROUTE_REVIEW_ENABLED", false),
  endpointGridDegrees: positiveNumber("AUTO_ROUTE_ENDPOINT_GRID_DEGREES", 0.002),
  corridorGridMeters: positiveNumber("AUTO_ROUTE_CORRIDOR_GRID_METERS", 80),
  corridorSamplePoints: Math.max(8, Math.round(positiveNumber("AUTO_ROUTE_CORRIDOR_SAMPLE_POINTS", 24))),
  minCorridorOverlap: Math.min(1, positiveNumber("AUTO_ROUTE_MIN_CORRIDOR_OVERLAP", 0.75)),
  maxCorridorDistanceMeters: positiveNumber("AUTO_ROUTE_MAX_CORRIDOR_DISTANCE_METERS", 80),
  maxLengthDifferenceRatio: Math.min(1, positiveNumber("AUTO_ROUTE_MAX_LENGTH_DIFFERENCE_RATIO", 0.30)),
  maxAccuracyMeters: positiveNumber("AUTO_ROUTE_MAX_ACCURACY_METERS", 80),
  maxGapSeconds: positiveNumber("AUTO_ROUTE_MAX_GAP_SECONDS", 300),
  maxSpeedKmh: positiveNumber("AUTO_ROUTE_MAX_SPEED_KMH", 140),
  minDistanceMeters: positiveNumber("AUTO_ROUTE_MIN_DISTANCE_METERS", 500),
  minDurationSeconds: positiveNumber("AUTO_ROUTE_MIN_DURATION_SECONDS", 120),
  minEvidenceCount: Math.max(2, Math.round(positiveNumber("AUTO_ROUTE_MIN_EVIDENCE_COUNT", 3))),
  minPointCount: Math.max(3, Math.round(positiveNumber("AUTO_ROUTE_MIN_POINT_COUNT", 10))),
  simplifyToleranceMeters: positiveNumber("AUTO_ROUTE_SIMPLIFY_TOLERANCE_METERS", 20)
});
