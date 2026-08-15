process.env.AUTO_ROUTE_LEARNING_ENABLED = "true";
process.env.AUTO_ROUTE_SEGMENT_LEARNING_ENABLED = "true";
process.env.AUTO_ROUTE_REVIEW_ENABLED = "true";
process.env.AUTO_ROUTE_SEGMENT_ALGORITHM_VERSION = "v3-segment";
process.env.AUTO_ROUTE_SEGMENT_GEOMETRY_VERSION = "segment-v1";

const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { encodeSegmentGeometryVersion } = require("../src/domain/learned-route-segment");
const { signToken } = require("../src/utils/jwt");

async function request(context, path, method = "GET", body) {
  const response = await fetch(`${context.url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${context.token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

async function createHttpContext(store) {
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/api`,
    token: signToken(store.getUserById("user-admin-01")),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function createOfficialRoute(store, id) {
  return store.createRoute({
    id,
    name: `Ruta ${id}`,
    code: id.toUpperCase().slice(0, 20),
    color: "#1473E6",
    origin: { latitude: 19.4, longitude: -99.1 },
    destination: { latitude: 19.42, longitude: -99.1 },
    originLabel: "Origen",
    destinationLabel: "Destino",
    stops: [],
    distanceMeters: 2224,
    durationSeconds: 360,
    durationInTrafficSeconds: 420,
    polyline: [
      { latitude: 19.4, longitude: -99.1 },
      { latitude: 19.405, longitude: -99.1 },
      { latitude: 19.41, longitude: -99.1 },
      { latitude: 19.415, longitude: -99.1 },
      { latitude: 19.42, longitude: -99.1 }
    ],
    organizationId: "manecomb-demo",
    createdBy: "user-admin-01"
  });
}

async function createReadySegmentCandidate(store, route, suffix = "1") {
  const geometryVersion = encodeSegmentGeometryVersion({
    routeId: route.id,
    routeRevision: route.revision,
    startDistanceMeters: 500,
    endDistanceMeters: 1550
  });
  const common = {
    organizationId: "manecomb-demo",
    groupKey: `segment-api-${suffix}`,
    corridorCluster: `cluster-${suffix}`,
    direction: "FORWARD",
    origin: { latitude: 19.4045, longitude: -99.1 },
    destination: { latitude: 19.414, longitude: -99.1 },
    polyline: [
      { latitude: 19.4045, longitude: -99.1 },
      { latitude: 19.407, longitude: -99.098 },
      { latitude: 19.411, longitude: -99.0977 },
      { latitude: 19.414, longitude: -99.1 }
    ],
    distanceMeters: 1180,
    durationSeconds: 150,
    algorithmVersion: "v3-segment",
    geometryVersion,
    representativeSessionId: `segment-api-${suffix}-session-1`,
    minimumEvidenceCount: 3,
    minimumDistinctServiceDays: 2
  };
  const evidence = [
    { sessionId: `segment-api-${suffix}-session-1`, vehicleId: "vehicle-101", serviceDate: "2026-08-10" },
    { sessionId: `segment-api-${suffix}-session-2`, vehicleId: "vehicle-102", serviceDate: "2026-08-10" },
    { sessionId: `segment-api-${suffix}-session-3`, vehicleId: "vehicle-101", serviceDate: "2026-08-11" }
  ];
  let candidate = null;
  for (const item of evidence) {
    candidate = await store.upsertLearnedRouteCandidate({
      ...common,
      ...item,
      observedAt: `${item.serviceDate}T12:00:00.000Z`
    });
  }
  assert.equal(candidate.status, "READY_FOR_REVIEW", "fixture V3 debe quedar revisable");
  return candidate;
}

(async () => {
  const store = createEmbeddedStore();
  const route = await createOfficialRoute(store, "route-v3-api");
  const candidate = await createReadySegmentCandidate(store, route);
  const context = await createHttpContext(store);

  try {
    const legacyList = await request(context, "/navigation/learned-routes?status=READY_FOR_REVIEW");
    assert.equal(legacyList.status, 200);
    assert.equal(legacyList.data.data.some((item) => item.id === candidate.id), false, "V3 no aparece en el listado legacy V2");

    const segmentList = await request(context, "/navigation/learned-route-segments?status=READY_FOR_REVIEW");
    assert.equal(segmentList.status, 200);
    assert.equal(segmentList.data.data.length, 1, "el endpoint V3 expone el tramo listo");
    assert.equal(segmentList.data.data[0].id, candidate.id);
    assert.equal(segmentList.data.data[0].segment.routeId, route.id);
    assert.equal(segmentList.data.data[0].segment.baseRouteRevision, 1);
    assert.equal(segmentList.data.data[0].segment.stale, false);

    const approval = await request(context, `/navigation/learned-routes/${candidate.id}/approve`, "POST");
    assert.equal(approval.status, 200, JSON.stringify(approval.data));
    assert.equal(approval.data.application.mode, "segment_patch");
    assert.equal(approval.data.application.previousRevision, 1);
    assert.equal(approval.data.route.id, route.id, "apply V3 mantiene la misma Route");
    assert.equal(approval.data.route.revision, 2, "apply V3 avanza revision una sola vez");

    const saved = await store.getRouteById(route.id);
    assert.equal(saved.revision, 2);
    assert.ok(saved.polyline.some((point) => point.longitude > -99.099), "la Route oficial contiene el tramo aprobado");
    const reviewed = await store.getLearnedRouteCandidateById(candidate.id);
    assert.equal(reviewed.status, "APPROVED");
    assert.equal(reviewed.approvedRouteId, route.id, "approvedRouteId enlaza la misma autoridad oficial");

    const repeat = await request(context, `/navigation/learned-routes/${candidate.id}/approve`, "POST");
    assert.equal(repeat.status, 200);
    assert.equal(repeat.data.application.idempotent, true, "repetir approval no vuelve a mutar la Route");
    assert.equal((await store.getRouteById(route.id)).revision, 2, "approval idempotente conserva revision");
  } finally {
    await context.close();
  }

  console.log("ok - route segment API: separacion V2/V3, apply in-place e idempotencia");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
