const assert = require("node:assert/strict");
const { recordSessionEvent } = require("../src/services/route-event-engine");

(async () => {
  const route = {
    id: "route-context-1",
    revision: 4,
    polyline: [
      { latitude: 19.4, longitude: -99.1 },
      { latitude: 19.41, longitude: -99.11 }
    ]
  };
  const events = [];
  let routeLookups = 0;
  const store = {
    async getRouteById(routeId) {
      routeLookups += 1;
      return routeId === route.id ? route : null;
    },
    async createRouteEvent(event) {
      events.push(event);
      return event;
    }
  };

  await recordSessionEvent(store, {
    id: "session-context-1",
    organizationId: "org-context",
    routeId: route.id,
    vehicleId: "vehicle-context",
    driverId: "driver-context"
  }, "SESSION_STARTED", { startedBy: "driver-context" });

  assert.equal(events.length, 1, "se registra un unico evento de inicio");
  assert.equal(events[0].metadata.routeContext.routeId, route.id, "snapshot conserva routeId");
  assert.equal(events[0].metadata.routeContext.routeRevision, 4, "snapshot conserva revision");
  assert.match(events[0].metadata.routeContext.geometryHash, /^[a-f0-9]{32}$/, "snapshot conserva hash geometrico estable");

  await recordSessionEvent(store, {
    id: "session-recording",
    organizationId: "org-context",
    routeId: "recording:vehicle-context",
    vehicleId: "vehicle-context",
    driverId: "driver-context"
  }, "SESSION_STARTED", { startedBy: "driver-context" });

  assert.equal(routeLookups, 1, "una jornada tecnica no consulta ni inventa Route oficial");
  assert.equal(events[1].metadata.routeContext, undefined, "jornada libre conserva contrato V2 sin contexto falso");

  console.log("ok - route session context: revision y geometria quedan congeladas al inicio");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
