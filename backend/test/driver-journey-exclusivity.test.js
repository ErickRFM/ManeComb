// Fija el invariante compuesto "una jornada activa por conductor".
//
// No existe un indice unico por conductor: la garantia nace de encadenar tres
// reglas, y por eso conviene fijarla en un test. Un refactor que rompa cualquiera
// de las tres reabre la posibilidad de que un conductor opere dos jornadas.
//
//   1. Un conductor esta emparejado con una sola unidad: reasignar libera la
//      anterior (changeDriverVehicle / syncDriverVehicleAssignment).
//   2. POST /navigation/sessions/start deriva driverId de vehicle.driverId,
//      no del cuerpo de la peticion.
//   3. Una unidad tiene una sola jornada activa: indice unico parcial activeKey.
//
// Encadenadas: si el conductor solo puede estar en una unidad y la jornada toma
// el conductor de la unidad, no hay forma de abrir una segunda jornada suya.

const assert = require("node:assert/strict");

const { createEmbeddedStore } = require("../src/data/store");

async function seedOrganizationWithTwoUnits() {
  const store = createEmbeddedStore();
  const stamp = Date.now();
  const owner = await store.registerUser({
    name: "Admin Exclusividad",
    email: `driver-exclusivity-owner-${stamp}@combis.app`,
    password: "Ruta123!",
    phone: "+52 55 1000 0000",
    companyName: "Exclusividad Combis",
    accountType: "company_owner"
  });
  const organizationId = owner.user?.organizationId || owner.organizationId;

  const first = await store.createVehicle({
    organizationId,
    code: "C-1",
    plate: "AAA-111-A",
    status: "available"
  });
  const second = await store.createVehicle({
    organizationId,
    code: "C-2",
    plate: "BBB-222-B",
    status: "available"
  });

  const driver = await store.createUser(
    {
      name: "Conductor Exclusivo",
      email: `driver-exclusivity-${stamp}@combis.app`,
      password: "Ruta123!",
      phone: "+52 55 2000 0000",
      organizationId,
      role: "driver"
    },
    "driver"
  );

  return { store, organizationId, first, second, driver: driver.user || driver };
}

function vehiclesHoldingDriver(store, organizationId, driverId) {
  return store
    .listVehiclesForOrganization(organizationId)
    .filter((vehicle) => String(vehicle.driverId || "") === String(driverId));
}

async function runDriverPairsWithOneUnitScenario() {
  const { store, organizationId, first, second, driver } = await seedOrganizationWithTwoUnits();

  const assignedFirst = await store.changeDriverVehicle({
    organizationId,
    userId: driver.id,
    vehicleId: first.id
  });
  assert.equal(assignedFirst.ok, true, "la primera asignacion debe aplicarse");
  assert.equal(
    vehiclesHoldingDriver(store, organizationId, driver.id).map((vehicle) => vehicle.id).join(),
    first.id
  );

  // Reasignar a otra unidad debe LIBERAR la anterior, no acumular emparejamientos.
  const assignedSecond = await store.changeDriverVehicle({
    organizationId,
    userId: driver.id,
    vehicleId: second.id
  });
  assert.equal(assignedSecond.ok, true, "la reasignacion debe aplicarse");

  const holders = vehiclesHoldingDriver(store, organizationId, driver.id);
  assert.equal(holders.length, 1, "un conductor no puede quedar emparejado con dos unidades");
  assert.equal(holders[0].id, second.id, "la unidad vigente debe ser la ultima asignada");

  const releasedFirst = await store.getVehicleById(first.id);
  assert.equal(releasedFirst.driverId, null, "la unidad anterior debe quedar sin conductor");

  console.log("ok - reasignar conductor libera la unidad anterior");
}

async function runSingleActiveJourneyPerVehicleScenario() {
  const { store, organizationId, first, driver } = await seedOrganizationWithTwoUnits();
  await store.changeDriverVehicle({ organizationId, userId: driver.id, vehicleId: first.id });

  const vehicle = await store.getVehicleById(first.id);
  const startPayload = {
    organizationId,
    routeId: `recording:${vehicle.id}`,
    vehicleId: vehicle.id,
    // Igual que el handler real: el conductor sale de la unidad, no del request.
    driverId: vehicle.driverId,
    startedAt: new Date().toISOString()
  };

  const started = await store.createRouteSession(startPayload);
  assert.equal(started.creationApplied, true, "la primera jornada debe crearse");
  assert.equal(started.driverId, driver.id, "la jornada toma el conductor de la unidad");

  const duplicate = await store.createRouteSession(startPayload);
  assert.equal(
    duplicate.creationApplied,
    false,
    "una unidad no puede abrir una segunda jornada activa"
  );

  console.log("ok - una unidad no admite dos jornadas activas");
}

async function runDriverCannotHoldTwoActiveJourneysScenario() {
  const { store, organizationId, first, second, driver } = await seedOrganizationWithTwoUnits();

  await store.changeDriverVehicle({ organizationId, userId: driver.id, vehicleId: first.id });
  const firstVehicle = await store.getVehicleById(first.id);
  await store.createRouteSession({
    organizationId,
    routeId: `recording:${firstVehicle.id}`,
    vehicleId: firstVehicle.id,
    driverId: firstVehicle.driverId,
    startedAt: new Date().toISOString()
  });

  // Con la jornada viva, el conductor no puede siquiera moverse a otra unidad.
  // Esta es la guarda que cierra el invariante: sin cambio de unidad no hay
  // forma de que exista una segunda unidad emparejada con el mismo conductor.
  const blocked = await store.changeDriverVehicle({
    organizationId,
    userId: driver.id,
    vehicleId: second.id
  });

  assert.equal(blocked.ok, false, "no se puede cambiar de unidad con jornada activa");
  assert.equal(blocked.code, "active_session");
  assert.equal(
    (await store.getVehicleById(second.id)).driverId,
    null,
    "la segunda unidad no queda emparejada con el conductor"
  );

  const holders = vehiclesHoldingDriver(store, organizationId, driver.id);
  assert.equal(holders.length, 1, "sigue habiendo una sola unidad por conductor");
  assert.equal(holders[0].id, first.id, "el conductor permanece en la unidad de su jornada");

  console.log("ok - el conductor no puede abrir una segunda jornada por otra unidad");
}

(async () => {
  await runDriverPairsWithOneUnitScenario();
  await runSingleActiveJourneyPerVehicleScenario();
  await runDriverCannotHoldTwoActiveJourneysScenario();
  console.log("driver journey exclusivity tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
