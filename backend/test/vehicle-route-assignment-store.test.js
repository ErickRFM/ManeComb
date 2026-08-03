const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");

function make(store, overrides = {}) {
  return store.createVehicleRouteAssignment({
    organizationId: "org-1",
    vehicleId: "veh-1",
    routeId: "route-1",
    ...overrides
  });
}

(async () => {
  const store = createEmbeddedStore();

  // --- create: valores por defecto y serializacion ---
  const created = make(store);
  assert.ok(created.id, "create: genera id");
  assert.equal(created.status, "AVAILABLE", "create: status por defecto AVAILABLE");
  assert.equal(created.priority, 0, "create: priority 0 por defecto");
  assert.equal(created.selectableByDriver, true, "create: selectableByDriver true por defecto");
  assert.equal(created.activationVersion, 0, "create: activationVersion 0");
  assert.equal(created.routeRevision, 0, "create: routeRevision 0 (sin activar)");
  assert.equal(created.activatedAt, null, "create: sin activatedAt");
  assert.ok(created.assignedAt, "create: assignedAt poblado");

  // --- getById ---
  const fetched = store.getVehicleRouteAssignmentById(created.id);
  assert.equal(fetched.id, created.id, "getById: devuelve el creado");
  assert.equal(store.getVehicleRouteAssignmentById("no-existe"), null, "getById: desconocido -> null");

  // --- validacion de entrada ---
  assert.throws(
    () => make(store, { status: "NOPE" }),
    /invalid_assignment_input/,
    "create: status invalido rechazado"
  );
  assert.throws(
    () => make(store, { priority: -3 }),
    /invalid_assignment_input/,
    "create: priority negativa rechazada"
  );
  assert.throws(
    () => make(store, { scheduledFrom: "2026-01-02T00:00:00Z", scheduledUntil: "2026-01-01T00:00:00Z" }),
    /invalid_assignment_input/,
    "create: ventana invalida (until <= from) rechazada"
  );

  // --- list: filtros y aislamiento ---
  make(store, { vehicleId: "veh-1", priority: 5 });
  make(store, { vehicleId: "veh-2", routeId: "route-2" });
  make(store, { organizationId: "org-2", vehicleId: "veh-1", routeId: "route-9" });

  const org1All = store.listVehicleRouteAssignments({ organizationId: "org-1" });
  assert.equal(org1All.length, 3, "list: org-1 tiene 3 (no ve org-2)");
  assert.ok(org1All.every((a) => a.organizationId === "org-1"), "list: aislamiento por tenant");

  const org1Veh1 = store.listVehicleRouteAssignments({ organizationId: "org-1", vehicleId: "veh-1" });
  assert.equal(org1Veh1.length, 2, "list: filtro por vehiculo");
  assert.ok(org1Veh1.every((a) => a.vehicleId === "veh-1"), "list: solo veh-1");

  const org2 = store.listVehicleRouteAssignments({ organizationId: "org-2" });
  assert.equal(org2.length, 1, "list: org-2 aislada ve solo la suya");

  // --- list: filtro por status ---
  const availables = store.listVehicleRouteAssignments({ organizationId: "org-1", status: "AVAILABLE" });
  assert.equal(availables.length, 3, "list: filtro status AVAILABLE");
  const actives = store.listVehicleRouteAssignments({ organizationId: "org-1", status: "ACTIVE" });
  assert.equal(actives.length, 0, "list: sin ACTIVE aun");

  // --- list: orden por priority ASC (menor = mayor prioridad) ---
  const ordered = store.listVehicleRouteAssignments({ organizationId: "org-1", vehicleId: "veh-1" });
  assert.ok(ordered[0].priority <= ordered[1].priority, "list: ordenado por priority ASC");

  console.log("ok - vehicle-route-assignment store CRUD: create/getById/list, filtros, aislamiento, validacion");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
