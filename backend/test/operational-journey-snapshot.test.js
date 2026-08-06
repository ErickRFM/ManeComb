const assert = require("node:assert/strict");
const {
  attachOperationalJourney,
  buildOperationalJourneySnapshot
} = require("../src/domain/operational-journey-snapshot");
const { resolveOperationalRouteId } = require("../src/services/operational-units-service");

const NOW = new Date("2026-08-06T15:00:00.000Z");

{
  const assigned = buildOperationalJourneySnapshot({
    id: "journey-1",
    status: "ASSIGNED",
    organizationId: "org-1",
    driverId: "driver-1",
    vehicleId: "vehicle-1",
    routeId: "route-1",
    scheduledStartAt: "2026-08-06T16:00:00.000Z",
    scheduledEndAt: "2026-08-07T00:00:00.000Z",
    startedAt: null
  }, NOW);

  assert.equal(assigned.status, "ASSIGNED");
  assert.equal(assigned.startedAt, null);
  assert.equal(assigned.elapsedSeconds, null);
  assert.equal(assigned.requiresDriverConfirmation, true);
  assert.equal(assigned.canStart, false);
  assert.equal(assigned.isDriving, false);
}

{
  const ready = buildOperationalJourneySnapshot({
    id: "journey-2",
    status: "READY",
    driverId: "driver-1",
    vehicleId: "vehicle-1",
    routeId: "route-1",
    scheduledStartAt: "2026-08-06T14:30:00.000Z",
    scheduledEndAt: "2026-08-06T22:30:00.000Z",
    confirmedAt: "2026-08-06T14:45:00.000Z",
    confirmedBy: "driver-1",
    startedAt: null
  }, NOW);

  assert.equal(ready.status, "READY");
  assert.equal(ready.confirmedBy, "driver-1");
  assert.equal(ready.elapsedSeconds, null);
  assert.equal(ready.requiresDriverConfirmation, false);
  assert.equal(ready.canStart, true);
}

{
  const running = buildOperationalJourneySnapshot({
    id: "journey-3",
    status: "RUNNING",
    driverId: "driver-1",
    vehicleId: "vehicle-1",
    routeId: "route-1",
    scheduledStartAt: "2026-08-06T14:00:00.000Z",
    scheduledEndAt: "2026-08-06T22:00:00.000Z",
    startedAt: "2026-08-06T14:30:00.000Z"
  }, NOW);

  assert.equal(running.elapsedSeconds, 1800);
  assert.equal(running.isDriving, true);
  assert.equal(running.canStart, false);
}

{
  assert.equal(buildOperationalJourneySnapshot({ status: "FINISHED" }, NOW), null);
  assert.equal(buildOperationalJourneySnapshot(null, NOW), null);

  const snapshot = attachOperationalJourney(
    { unitId: "vehicle-1", snapshotVersion: 1, session: null },
    {
      id: "journey-4",
      status: "ASSIGNED",
      driverId: "driver-1",
      vehicleId: "vehicle-1",
      routeId: "route-1",
      scheduledStartAt: "2026-08-06T16:00:00.000Z",
      scheduledEndAt: "2026-08-07T00:00:00.000Z"
    },
    NOW
  );

  assert.equal(snapshot.session, null, "el contrato session legado se conserva sin inventar inicio");
  assert.equal(snapshot.journey.status, "ASSIGNED");
  assert.equal(snapshot.snapshotVersion, 2);
}

{
  const vehicle = {
    assignedRoute: { routeId: "route-operational" },
    routeId: "route-legacy"
  };
  const pendingJourney = {
    status: "ASSIGNED",
    routeId: "route-future"
  };

  assert.equal(
    resolveOperationalRouteId(vehicle, pendingJourney),
    "route-operational",
    "una Jornada pendiente no debe reemplazar la ruta operativa asignada de la unidad"
  );
  assert.equal(
    resolveOperationalRouteId({ routeId: "route-legacy" }, pendingJourney),
    "route-legacy",
    "el routeId vigente del vehículo conserva prioridad sobre una Jornada pendiente"
  );
  assert.equal(
    resolveOperationalRouteId({}, pendingJourney),
    "route-future",
    "la ruta de Jornada solo funciona como fallback cuando la unidad no tiene asignación"
  );
}

console.log("operational-journey-snapshot.test.js: OK");
