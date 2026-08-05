const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const { planActivation, OUTCOME } = require("../src/domain/vehicle-route-assignment-activation");

const ORG = "org-act";

function setup() {
  const store = createEmbeddedStore();
  const route = store.createRoute({
    id: "route-act-1",
    name: "R-ACT",
    code: "R-ACT",
    color: "#1473E6",
    origin: { latitude: 19.415, longitude: -99.073 },
    destination: { latitude: 19.4452, longitude: -99.1513 },
    originLabel: "A",
    destinationLabel: "B",
    stops: [],
    distanceMeters: 1000,
    durationSeconds: 600,
    durationInTrafficSeconds: 600,
    polyline: [
      { latitude: 19.415, longitude: -99.073 },
      { latitude: 19.4452, longitude: -99.1513 }
    ],
    organizationId: ORG,
    createdBy: "admin-1"
  });
  const vehicle = store.createVehicle({ id: "veh-act-1", organizationId: ORG, code: "U-100", plate: "ACT-100" });
  return { store, route, vehicle };
}

function makeAssignment(store, overrides = {}) {
  return store.createVehicleRouteAssignment({
    organizationId: ORG,
    vehicleId: "veh-act-1",
    routeId: "route-act-1",
    ...overrides
  });
}

(async () => {
  // --- Planificador puro: activacion basica ---
  {
    const target = {
      id: "a1", organizationId: ORG, vehicleId: "v1", routeId: "r1",
      status: "AVAILABLE", priority: 0, selectableByDriver: true, activationVersion: 0, routeRevision: 0
    };
    const plan = planActivation({
      target, currentActive: null, vehicleProjectsTarget: false, routeRevision: 3,
      context: { organizationId: ORG, vehicleId: "v1", actor: "admin", now: "2026-01-01T00:00:00.000Z" }
    });
    assert.equal(plan.outcome, OUTCOME.ACTIVATED, "planner: AVAILABLE -> ACTIVATED");
    assert.equal(plan.assignmentPatch.status, "ACTIVE");
    assert.equal(plan.assignmentPatch.activationVersion, 1, "planner: activationVersion++");
    assert.equal(plan.assignmentPatch.routeRevision, 3, "planner: captura Route.revision");
    assert.ok(plan.event && plan.event.type === "route-assignment:updated", "planner: evento sanitizado");
  }
  // Planificador: otra ACTIVE distinta -> already_active (switch es F6/F7)
  {
    const target = { id: "a2", organizationId: ORG, vehicleId: "v1", routeId: "r2", status: "AVAILABLE", activationVersion: 0, routeRevision: 0, selectableByDriver: true };
    const other = { id: "a1", organizationId: ORG, vehicleId: "v1", routeId: "r1", status: "ACTIVE", activationVersion: 1 };
    const plan = planActivation({ target, currentActive: other, routeRevision: 1, context: { organizationId: ORG, vehicleId: "v1", actor: "admin", now: "2026-01-01T00:00:00.000Z" } });
    assert.equal(plan.outcome, OUTCOME.CONFLICT);
    assert.equal(plan.reason, "already_active", "planner: otra ACTIVE -> already_active");
  }
  console.log("ok - planActivation puro: ACTIVATED / already_active");

  // --- Motor embedded: primera activacion ---
  {
    const { store } = setup();
    const a = makeAssignment(store);
    const res = await store.activateVehicleRouteAssignment({
      organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin", source: "admin", reason: "admin_activated"
    });
    assert.equal(res.outcome, "ACTIVATED", "motor: ACTIVATED");
    assert.equal(res.applied, true);
    assert.equal(res.assignment.status, "ACTIVE");
    assert.equal(res.assignment.activationVersion, 1);
    assert.equal(res.assignment.routeRevision, 1, "motor: captura revision 1");
    assert.ok(res.assignment.activatedAt, "motor: activatedAt poblado");
    assert.equal(res.vehicle.routeId, "route-act-1", "motor: proyecta Vehicle.routeId");
    assert.ok(res.vehicle.assignedRoute, "motor: proyecta Vehicle.assignedRoute");
    assert.ok(res.event && res.event.outcome === "ACTIVATED", "motor: evento listo para F4");

    // Idempotencia: segunda llamada sin cambios -> IDEMPOTENT, sin nuevas escrituras.
    const res2 = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin" });
    assert.equal(res2.outcome, "IDEMPOTENT", "motor: segunda llamada IDEMPOTENT");
    assert.equal(res2.applied, false);
    assert.equal(res2.assignment.activationVersion, 1, "motor: activationVersion NO cambia en idempotente");
  }
  console.log("ok - motor embedded: primera activacion proyecta e idempotencia no reescribe");

  // --- Editar la ruta (revision drift) NO reconcilia: updateRoute ya re-proyecta el vehiculo,
  // y routeRevision se captura solo al ACTIVAR (no "la ultima vista"). => IDEMPOTENT, sin cambios. ---
  {
    const { store } = setup();
    const a = makeAssignment(store);
    await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin" });
    store.updateRoute("route-act-1", { distanceMeters: 2500 }); // revision 1 -> 2 (y re-proyecta el vehiculo)
    const res = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin" });
    assert.equal(res.outcome, "IDEMPOTENT", "motor: editar ruta con proyeccion intacta -> IDEMPOTENT");
    assert.equal(res.applied, false);
    assert.equal(res.assignment.routeRevision, 1, "motor: routeRevision se conserva (capturada al activar)");
  }
  console.log("ok - motor embedded: editar ruta no reconcilia (routeRevision estable, IDEMPOTENT)");

  // --- Reconciliacion por drift de PROYECCION (assignedRoute roto): re-proyecta SOLO el Vehicle ---
  {
    const { store } = setup();
    const a = makeAssignment(store);
    const activated = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin" });
    store.clearAssignedRouteFromVehicle("veh-act-1"); // rompe la proyeccion
    const res = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin" });
    assert.equal(res.outcome, "RECONCILED", "motor: proyeccion rota -> RECONCILED");
    assert.equal(res.applied, true);
    assert.equal(res.vehicle.routeId, "route-act-1", "motor: re-proyecta routeId del Vehicle");
    assert.ok(res.vehicle.assignedRoute, "motor: re-proyecta assignedRoute del Vehicle");
    // La ASIGNACION no se toca en RECONCILED (solo Vehicle).
    assert.equal(res.assignment.activatedAt, activated.assignment.activatedAt, "motor: activatedAt intacto");
    assert.equal(res.assignment.activationVersion, 1, "motor: activationVersion intacto");
    assert.equal(res.assignment.routeRevision, 1, "motor: routeRevision intacto (asignacion no modificada)");
  }
  console.log("ok - motor embedded: reconciliacion re-proyecta unicamente el Vehicle");

  // --- already_active: activar una segunda mientras otra esta ACTIVE ---
  {
    const { store } = setup();
    const a = makeAssignment(store);
    const b = makeAssignment(store, { routeId: "route-act-1" });
    await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin" });
    const res = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: b.id, actor: "admin" });
    assert.equal(res.outcome, "CONFLICT");
    assert.equal(res.reason, "already_active", "motor: segunda activacion -> already_active");
    assert.equal(res.applied, false);
    // La segunda sigue AVAILABLE (sin escritura).
    assert.equal(store.getVehicleRouteAssignmentById(b.id).status, "AVAILABLE", "motor: conflicto no escribe");
  }
  console.log("ok - motor embedded: una sola ACTIVE por unidad (already_active)");

  // --- active_route_session: sesion corriendo en OTRA ruta bloquea ---
  {
    const { store } = setup();
    store.createRoute({
      id: "route-act-2", name: "R2", code: "R2", color: "#000",
      origin: { latitude: 19.4, longitude: -99.0 }, destination: { latitude: 19.5, longitude: -99.2 },
      stops: [], distanceMeters: 500, durationSeconds: 300, durationInTrafficSeconds: 300,
      polyline: [{ latitude: 19.4, longitude: -99.0 }, { latitude: 19.5, longitude: -99.2 }],
      organizationId: ORG, createdBy: "admin-1"
    });
    const a = makeAssignment(store, { routeId: "route-act-1" });
    store.createRouteSession({ vehicleId: "veh-act-1", routeId: "route-act-2", organizationId: ORG });
    const res = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin" });
    assert.equal(res.outcome, "CONFLICT");
    assert.equal(res.reason, "active_route_session", "motor: sesion en otra ruta bloquea");
  }
  console.log("ok - motor embedded: RouteSession en otra ruta bloquea (active_route_session)");

  // --- CAS: expectedActiveAssignmentId / expectedActivationVersion ---
  {
    const { store } = setup();
    const a = makeAssignment(store);
    const casMismatch = await store.activateVehicleRouteAssignment({
      organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin", expectedActiveAssignmentId: "otra-x"
    });
    assert.equal(casMismatch.reason, "active_assignment_conflict", "motor: CAS de ACTIVE esperada");

    const versionMismatch = await store.activateVehicleRouteAssignment({
      organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin", expectedActivationVersion: 99
    });
    assert.equal(versionMismatch.reason, "activation_version_conflict", "motor: CAS de activationVersion");

    // Con la ACTIVE esperada correcta (ninguna) y version correcta (0) -> ACTIVATED.
    const okRes = await store.activateVehicleRouteAssignment({
      organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin", expectedActiveAssignmentId: null, expectedActivationVersion: 0
    });
    assert.equal(okRes.outcome, "ACTIVATED", "motor: CAS correcto -> ACTIVATED");
  }
  console.log("ok - motor embedded: CAS de ACTIVE esperada y de activationVersion");

  // --- driver bloqueado / not_found ---
  {
    const { store } = setup();
    const locked = makeAssignment(store, { selectableByDriver: false });
    const resDriver = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: locked.id, actor: "driver" });
    assert.equal(resDriver.reason, "admin_locked", "motor: driver no puede activar bloqueada");
    // ...pero un admin si.
    const resAdmin = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: locked.id, actor: "admin" });
    assert.equal(resAdmin.outcome, "ACTIVATED", "motor: admin activa aunque este bloqueada al driver");

    const resMissing = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: "no-existe", actor: "admin" });
    assert.equal(resMissing.reason, "not_found", "motor: asignacion inexistente -> not_found");

    const resTenant = await store.activateVehicleRouteAssignment({ organizationId: "org-otra", vehicleId: "veh-act-1", assignmentId: locked.id, actor: "admin" });
    assert.equal(resTenant.reason, "not_found", "motor: tenant ajeno -> not_found");
  }
  console.log("ok - motor embedded: admin_locked por driver, admin permitido, not_found por tenant");

  // --- Etapa 7: endurecimiento del contrato de idempotencia / reconciliacion ---
  {
    const { store } = setup();
    const a = makeAssignment(store);
    const first = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin" });
    const activatedAt = first.assignment.activatedAt;
    assert.ok(activatedAt, "activatedAt inicial poblado");

    // Idempotencia: NO cambia activatedAt ni assignedAt, NO emite evento.
    const idem = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin", now: "2027-01-01T00:00:00.000Z" });
    assert.equal(idem.outcome, "IDEMPOTENT");
    assert.equal(idem.assignment.activatedAt, activatedAt, "idempotencia: activatedAt estable (no re-sella)");
    assert.equal(idem.event, null, "idempotencia: NO emite evento");

    // Reconciliacion (drift de proyeccion): preserva la IDENTIDAD de la activacion
    // (activatedAt/activationVersion/routeRevision), modifica SOLO el Vehicle, pero SI emite evento.
    store.clearAssignedRouteFromVehicle("veh-act-1");
    const recon = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin", source: "system", reason: "route_switched", now: "2027-02-02T00:00:00.000Z" });
    assert.equal(recon.outcome, "RECONCILED");
    assert.equal(recon.assignment.activatedAt, activatedAt, "reconciliacion: activatedAt estable (misma activacion)");
    assert.equal(recon.assignment.activationVersion, 1, "reconciliacion: activationVersion estable");
    assert.equal(recon.assignment.routeRevision, 1, "reconciliacion: routeRevision intacto (asignacion no modificada)");
    assert.ok(recon.event && recon.event.outcome === "RECONCILED", "reconciliacion: SI emite evento");
    assert.equal(recon.event.reason, "route_switched", "reconciliacion: evento con motivo sanitizado");

    // Conflicto: nunca emite evento.
    const conflict = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "veh-act-1", assignmentId: a.id, actor: "admin", expectedActiveAssignmentId: "otra" });
    assert.equal(conflict.outcome, "CONFLICT");
    assert.equal(conflict.event, null, "conflicto: NO emite evento");
  }
  console.log("ok - motor embedded (etapa 7): idempotencia estable, reconciliacion preserva identidad y emite evento");

  console.log("ok - vehicle-route-assignment-activation F3 etapa 4-7: motor embedded completo");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
