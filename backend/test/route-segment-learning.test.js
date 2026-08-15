const assert = require("node:assert/strict");
const {
  decodeSegmentGeometryVersion,
  encodeSegmentGeometryVersion,
  isSegmentCandidate
} = require("../src/domain/learned-route-segment");
const {
  extractDeviationSegments,
  persistDeviationSegments
} = require("../src/services/route-segment-learning");
const { splicePolylineSegment } = require("../src/domain/route-geometry");

function position(latitude, longitude, seconds) {
  return {
    latitude,
    longitude,
    accuracy: 8,
    timestamp: new Date(Date.parse("2026-08-14T12:00:00.000Z") + seconds * 1000)
  };
}

(async () => {
  const route = {
    id: "route-segment-1",
    revision: 7,
    organizationId: "org-segment",
    polyline: [
      { latitude: 19.4, longitude: -99.1 },
      { latitude: 19.405, longitude: -99.1 },
      { latitude: 19.41, longitude: -99.1 },
      { latitude: 19.415, longitude: -99.1 },
      { latitude: 19.42, longitude: -99.1 }
    ]
  };
  const positions = [
    position(19.4040, -99.1, 0),
    position(19.4050, -99.0980, 10),
    position(19.4075, -99.0978, 20),
    position(19.4100, -99.0977, 30),
    position(19.4125, -99.0980, 40),
    position(19.4140, -99.1, 50),
    position(19.4160, -99.1, 60)
  ];

  const segments = extractDeviationSegments(positions, route.polyline);
  assert.equal(segments.length, 1, "salida y reincorporacion generan un solo tramo candidato");
  assert.ok(segments[0].candidatePolyline.length >= 3, "se conserva la forma real del desvio");
  assert.ok(segments[0].endProjection.distanceAlongRoute > segments[0].startProjection.distanceAlongRoute, "el tramo avanza sobre la ruta oficial");
  assert.ok(segments[0].baselineDistanceMeters > 0, "se puede comparar contra el tramo oficial reemplazado");

  const unfinished = extractDeviationSegments(positions.slice(0, 5), route.polyline);
  assert.equal(unfinished.length, 0, "una salida sin reincorporacion no se aprende como mejora");

  const version = encodeSegmentGeometryVersion({
    routeId: route.id,
    routeRevision: route.revision,
    startDistanceMeters: 500,
    endDistanceMeters: 1250
  });
  assert.deepEqual(decodeSegmentGeometryVersion(version), {
    formatVersion: "segment-v1",
    routeId: route.id,
    routeRevision: 7,
    startDistanceMeters: 500,
    endDistanceMeters: 1250
  });
  assert.equal(isSegmentCandidate({ algorithmVersion: "v3-segment", geometryVersion: version }, "v3-segment"), true);

  const captured = [];
  const store = {
    async listLearnedRouteCandidates() { return []; },
    async upsertLearnedRouteCandidate(payload) {
      captured.push(payload);
      return {
        id: `candidate-${captured.length}`,
        status: "COLLECTING",
        confidence: 0.5,
        evidenceCount: 1,
        distinctServiceDays: 1,
        ...payload
      };
    }
  };
  const persisted = await persistDeviationSegments({
    store,
    session: {
      id: "session-segment-1",
      organizationId: "org-segment",
      vehicleId: "vehicle-1"
    },
    route,
    positions,
    serviceDate: "2026-08-14",
    observedAt: "2026-08-14T12:00:00.000Z",
    algorithmVersion: "v3-segment",
    geometryFormatVersion: "segment-v1",
    minimumEvidenceCount: 3,
    minimumDistinctServiceDays: 2
  });
  assert.equal(persisted.length, 1, "el tramo elegible se persiste una sola vez");
  assert.equal(captured[0].algorithmVersion, "v3-segment", "V3 no reinterpreta candidatos V2");
  const persistedMetadata = decodeSegmentGeometryVersion(captured[0].geometryVersion);
  assert.equal(persistedMetadata.routeId, route.id, "candidato queda anclado a la ruta oficial");
  assert.equal(persistedMetadata.routeRevision, 7, "candidato queda anclado a la revision exacta");

  const patched = splicePolylineSegment(
    route.polyline,
    persistedMetadata.startDistanceMeters,
    persistedMetadata.endDistanceMeters,
    captured[0].polyline
  );
  assert.ok(patched.some((point) => point.longitude > -99.099), "el patch sustituye solo el tramo aprendido");
  assert.deepEqual(patched[0], route.polyline[0], "el resto anterior de la ruta se conserva");
  assert.deepEqual(patched[patched.length - 1], route.polyline[route.polyline.length - 1], "el resto posterior de la ruta se conserva");

  console.log("ok - route segment learning: detecta, ancla por revision y parchea solo el tramo");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
