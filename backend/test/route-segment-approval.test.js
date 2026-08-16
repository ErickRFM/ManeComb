const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const { encodeSegmentGeometryVersion } = require("../src/domain/learned-route-segment");
const { applySegmentCandidateToRoute } = require("../src/services/route-segment-approval");

function createRoute(store, id) {
  return store.createRoute({
    id,
    name: "Ruta V3",
    code: "R-V3",
    color: "#1473E6",
    origin: { latitude: 19.4, longitude: -99.1 },
    destination: { latitude: 19.42, longitude: -99.1 },
    originLabel: "Origen",
    destinationLabel: "Destino",
    stops: [],
    distanceMeters: 2200,
    durationSeconds: 360,
    durationInTrafficSeconds: 420,
    polyline: [
      { latitude: 19.4, longitude: -99.1 },
      { latitude: 19.405, longitude: -99.1 },
      { latitude: 19.41, longitude: -99.1 },
      { latitude: 19.415, longitude: -99.1 },
      { latitude: 19.42, longitude: -99.1 }
    ],
    organizationId: "org-v3",
    createdBy: "admin-v3"
  });
}

function candidateFor(route, id = "candidate-v3") {
  return {
    id,
    organizationId: "org-v3",
    algorithmVersion: "v3-segment",
    geometryVersion: encodeSegmentGeometryVersion({
      routeId: route.id,
      routeRevision: route.revision,
      startDistanceMeters: 500,
      endDistanceMeters: 1550
    }),
    polyline: [
      { latitude: 19.4045, longitude: -99.1 },
      { latitude: 19.407, longitude: -99.098 },
      { latitude: 19.411, longitude: -99.0977 },
      { latitude: 19.414, longitude: -99.1 }
    ],
    distanceMeters: 1180,
    durationSeconds: 150,
    evidenceCount: 6,
    distinctServiceDays: 3
  };
}

(async () => {
  const store = createEmbeddedStore();
  const route = createRoute(store, "route-v3-apply");
  const candidate = candidateFor(route);
  const result = await applySegmentCandidateToRoute({
    store,
    candidate,
    actor: { id: "admin-v3", role: "admin", organizationId: "org-v3" }
  });
  assert.equal(result.applied, true, "candidato vigente se aplica");
  assert.equal(result.route.id, route.id, "no crea una ruta paralela");
  assert.equal(result.route.revision, 2, "la autoridad oficial avanza una sola revision");
  assert.ok(result.route.polyline.some((point) => point.longitude > -99.099), "la geometria contiene el tramo aprendido");
  assert.deepEqual(result.route.polyline[0], route.polyline[0], "se conserva el prefijo de la ruta");
  assert.deepEqual(result.route.polyline[result.route.polyline.length - 1], route.polyline[route.polyline.length - 1], "se conserva el sufijo de la ruta");
  assert.equal(result.previousRoute.revision, 1, "queda disponible el snapshot previo para auditoria");

  const concurrentBase = { ...route, revision: 8 };
  const concurrentCandidate = candidateFor(concurrentBase, "candidate-concurrent-refresh");
  const concurrentStore = {
    async getRouteById(routeId) {
      return routeId === concurrentBase.id ? concurrentBase : null;
    },
    async updateRouteIfRevision(routeId, expectedRevision, payload) {
      assert.equal(routeId, concurrentBase.id);
      assert.equal(expectedRevision, 8);
      return { ...concurrentBase, ...payload, revision: 9 };
    }
  };
  const concurrentResult = await applySegmentCandidateToRoute({
    store: concurrentStore,
    candidate: concurrentCandidate,
    actor: { id: "admin-v3", role: "admin", organizationId: "org-v3" }
  });
  assert.equal(concurrentResult.applied, true,
    "un CAS aplicado no se reporta como route_update_failed por un refresh posterior");
  assert.equal(concurrentResult.reason, undefined);
  assert.equal(concurrentResult.committedRevision, 9,
    "el servicio expone la revision comprometida por el CAS ganador");
  assert.equal(concurrentResult.route.revision, 9);

  const staleStore = createEmbeddedStore();
  const staleBase = createRoute(staleStore, "route-v3-stale");
  const staleCandidate = candidateFor(staleBase, "candidate-stale");
  staleStore.updateRoute(staleBase.id, { distanceMeters: staleBase.distanceMeters + 10 });
  const staleResult = await applySegmentCandidateToRoute({
    store: staleStore,
    candidate: staleCandidate,
    actor: { id: "admin-v3", role: "admin", organizationId: "org-v3" }
  });
  assert.equal(staleResult.applied, false, "candidato viejo nunca pisa una ruta nueva");
  assert.equal(staleResult.reason, "candidate_stale", "conflicto se clasifica de forma explicita");
  assert.equal((await staleStore.getRouteById(staleBase.id)).revision, 2, "el intento stale no muta la ruta");

  console.log("ok - learned segment approval: patch in-place, revision monotona y stale guard");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
