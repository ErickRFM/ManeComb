const assert = require("node:assert/strict");
const { FleetRepository } = require("../src/data/repositories/fleet-repository");

(async () => {
  const route = {
    id: "route-cas-1",
    organizationId: "org-cas",
    revision: 3,
    polyline: [
      { latitude: 19.4, longitude: -99.1 },
      { latitude: 19.41, longitude: -99.11 }
    ]
  };
  const actor = { id: "admin-cas", role: "admin", organizationId: "org-cas" };
  const writes = [];
  const baseStore = {
    getRouteById(routeId) {
      return routeId === route.id ? { ...route } : null;
    },
    async updateRoute(routeId, payload, receivedActor) {
      writes.push({ routeId, payload, actor: receivedActor });
      return { ...route, revision: 4, distanceMeters: 1990 };
    }
  };

  let capturedQuery = null;
  let capturedUpdate = null;
  const RouteModel = {
    db: { readyState: 1 },
    findOneAndUpdate(query, update) {
      capturedQuery = query;
      capturedUpdate = update;
      return {
        async lean() {
          return { ...route, ...update.$set };
        }
      };
    }
  };
  const repository = new FleetRepository(baseStore, { RouteModel });
  const result = await repository.updateRouteIfRevision(
    route.id,
    3,
    { distanceMeters: 1990, polyline: route.polyline },
    actor
  );

  assert.equal(result.revision, 4, "CAS ganador devuelve la revision siguiente");
  assert.deepEqual(capturedQuery, {
    _id: route.id,
    organizationId: route.organizationId,
    revision: 3
  }, "Mongo filtra por id, tenant y revision esperada");
  assert.equal(capturedUpdate.$set.revision, 4, "Mongo incrementa exactamente una revision");
  assert.equal(capturedUpdate.$set.distanceMeters, 1990, "Mongo aplica el patch operativo");
  assert.equal(writes.length, 1, "el escritor canonico se invoca una vez para refrescar proyecciones");
  assert.deepEqual(writes[0].payload, {}, "el refresh posterior es no-op sobre Route");
  assert.equal(writes[0].actor, actor, "el actor se conserva hasta la autoridad de persistencia");

  const staleWrites = [];
  const staleRepository = new FleetRepository({
    ...baseStore,
    async updateRoute(...args) {
      staleWrites.push(args);
      return null;
    }
  }, {
    RouteModel: {
      db: { readyState: 1 },
      findOneAndUpdate() {
        return { async lean() { return null; } };
      }
    }
  });
  const stale = await staleRepository.updateRouteIfRevision(route.id, 3, { distanceMeters: 1800 }, actor);
  assert.equal(stale, null, "CAS perdido devuelve null al servicio");
  assert.equal(staleWrites.length, 0, "CAS perdido no ejecuta refresh ni segundo writer");

  console.log("ok - fleet route CAS: revision atomica y refresh canonico quedan en Store");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
