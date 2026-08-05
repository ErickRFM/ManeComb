// RC-MULTI-ROUTE-DRIVER-01 F3.1 — Validacion REAL contra un Mongo replica set NO PRODUCTIVO
// (mongodb-memory-server, efimero, 127.0.0.1). Demuestra atomicidad/transacciones de verdad.
//
// PROHIBIDO produccion: este test NUNCA lee MONGO_URI del entorno; arranca su propio replica set
// efimero en localhost, usa una DB de prueba identificable y la ELIMINA al terminar. Si no hay
// replica set disponible (binario no descargable), imprime SKIP y sale 0 SIN inventar resultados
// (el gate queda documentado como bloqueado en el reporte).
//
// Ejecutar: npm run test:mongo-replset   (requiere devDependency mongodb-memory-server)

const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const TEST_DB = "f31_replset_validation";
const ORG = "F31-REPLSET-ORG";

async function tryCreateReplSet() {
  let MongoMemoryReplSet;
  try {
    ({ MongoMemoryReplSet } = require("mongodb-memory-server"));
  } catch (error) {
    return { skip: true, reason: "mongodb-memory-server no instalado" };
  }
  try {
    const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    return { skip: false, rs };
  } catch (error) {
    return { skip: true, reason: `no se pudo iniciar el replica set: ${String(error.message || error).split("\n")[0]}` };
  }
}

function routePayload(id, org) {
  return {
    id, organizationId: org, name: id, code: id, color: "#1473E6",
    origin: { latitude: 19.415, longitude: -99.073 },
    destination: { latitude: 19.4452, longitude: -99.1513 },
    originLabel: "A", destinationLabel: "B", stops: [],
    distanceMeters: 1000, durationSeconds: 600, durationInTrafficSeconds: 600,
    polyline: [{ latitude: 19.415, longitude: -99.073 }, { latitude: 19.4452, longitude: -99.1513 }]
  };
}

(async () => {
  const setup = await tryCreateReplSet();
  if (setup.skip) {
    console.log(`SKIP mongo-replset: ${setup.reason}`);
    console.log("F3_MONGO_REAL=SKIPPED");
    process.exit(0);
  }

  const rs = setup.rs;
  const uri = rs.getUri();
  const host = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  // Evidencia de NO-produccion: host loopback + DB de prueba efimera.
  assert.ok(/^(127\.0\.0\.1|localhost)/.test(host), `host debe ser loopback (no produccion): ${host}`);
  console.log(`ENV replica set efimero host=${host} db=${TEST_DB} (no productivo)`);

  let store;
  let VehicleRouteAssignmentModel;
  let VehicleModel;
  let cleanupOk = false;
  try {
    await mongoose.connect(uri, { dbName: TEST_DB });
    ({ VehicleRouteAssignmentModel, VehicleModel } = require("../src/data/models"));
    await VehicleRouteAssignmentModel.syncIndexes(); // asegura el indice unico parcial ACTIVE
    const { createMongoStore } = require("../src/data/mongo-store");
    store = await createMongoStore();

    // ---------- Datos de prueba identificables ----------
    await store.createVehicle({ id: "f31-veh-1", organizationId: ORG, code: "F31-U1", plate: "F31-001" });
    await store.createRoute(routePayload("f31-route-1", ORG));
    await store.createRoute(routePayload("f31-route-2", ORG));
    const a1 = await store.createVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-1", routeId: "f31-route-1" });
    const a2 = await store.createVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-1", routeId: "f31-route-2" });

    // ---------- Caso 1: primera activacion ----------
    const r1 = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-1", assignmentId: a1.id, actor: "admin", source: "admin", reason: "admin_activated" });
    assert.equal(r1.outcome, "ACTIVATED", "real: primera activacion ACTIVATED");
    assert.equal(r1.applied, true);
    // Caso 6: Vehicle consistente.
    assert.equal(r1.vehicle.routeId, "f31-route-1", "real: Vehicle.routeId proyectado");
    assert.ok(r1.vehicle.assignedRoute && r1.vehicle.assignedRoute.routeId === "f31-route-1", "real: Vehicle.assignedRoute consistente");
    console.log("ok - real: caso 1 primera activacion + caso 6 consistencia Vehicle");

    // ---------- Caso 8: idempotencia ----------
    const rIdem = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-1", assignmentId: a1.id, actor: "admin" });
    assert.equal(rIdem.outcome, "IDEMPOTENT", "real: segunda llamada IDEMPOTENT");
    assert.equal(rIdem.assignment.activationVersion, r1.assignment.activationVersion, "real: activationVersion estable en idempotencia");
    console.log("ok - real: caso 8 idempotencia (sin doble escritura)");

    // ---------- Caso 2 + 7: conflicto controlado (activar la 2a con una ya ACTIVE) ----------
    const rConf = await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-1", assignmentId: a2.id, actor: "admin" });
    assert.equal(rConf.outcome, "CONFLICT", "real: activar 2a con una ACTIVE -> CONFLICT");
    assert.equal(rConf.reason, "already_active", "real: conflicto already_active");
    assert.equal(await VehicleRouteAssignmentModel.countDocuments({ _id: a2.id, status: "ACTIVE" }), 0, "real: la 2a NO quedo ACTIVE");
    console.log("ok - real: caso 2/7 conflicto controlado already_active (sin escribir)");

    // ---------- Caso 3: rollback forzado DENTRO de la transaccion ----------
    // Se fuerza un error en la proyeccion del Vehicle DESPUES de escribir la asignacion; la tx debe
    // abortar y dejar TODO como estaba (atomicidad real). Se usa una tercera asignacion limpia.
    const veh2 = await store.createVehicle({ id: "f31-veh-2", organizationId: ORG, code: "F31-U2", plate: "F31-002" });
    const a3 = await store.createVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-2", routeId: "f31-route-1" });
    const originalFindByIdAndUpdate = VehicleModel.findByIdAndUpdate.bind(VehicleModel);
    VehicleModel.findByIdAndUpdate = () => ({ lean: () => Promise.reject(new Error("rollback forzado en proyeccion")) });
    let threw = false;
    try {
      await store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-2", assignmentId: a3.id, actor: "admin" });
    } catch (error) {
      threw = /rollback forzado/.test(error.message);
    } finally {
      VehicleModel.findByIdAndUpdate = originalFindByIdAndUpdate;
    }
    assert.equal(threw, true, "real: el error intermedio se propaga");
    // Atomicidad: la asignacion NO quedo ACTIVE y el Vehicle NO quedo con ruta.
    const a3After = await VehicleRouteAssignmentModel.findById(a3.id).lean();
    assert.equal(a3After.status, "AVAILABLE", "real: rollback -> asignacion sigue AVAILABLE");
    const veh2After = await VehicleModel.findById("f31-veh-2").lean();
    assert.ok(!veh2After.routeId, "real: rollback -> Vehicle sin routeId (nada persistido)");
    console.log("ok - real: caso 3 rollback atomico dentro de la transaccion");

    // ---------- Caso 4 + 5: dos activaciones concurrentes -> una sola ACTIVE ----------
    const veh3 = await store.createVehicle({ id: "f31-veh-3", organizationId: ORG, code: "F31-U3", plate: "F31-003" });
    const c1 = await store.createVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-3", routeId: "f31-route-1" });
    const c2 = await store.createVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-3", routeId: "f31-route-2" });
    const [ra, rb] = await Promise.all([
      store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-3", assignmentId: c1.id, actor: "admin" }),
      store.activateVehicleRouteAssignment({ organizationId: ORG, vehicleId: "f31-veh-3", assignmentId: c2.id, actor: "admin" })
    ]);
    const activatedCount = [ra, rb].filter((r) => r.outcome === "ACTIVATED").length;
    const conflictCount = [ra, rb].filter((r) => r.outcome === "CONFLICT").length;
    assert.equal(activatedCount, 1, "real: exactamente una activacion gana");
    assert.equal(conflictCount, 1, "real: la otra recibe conflicto controlado");
    const activeInDb = await VehicleRouteAssignmentModel.countDocuments({ organizationId: ORG, vehicleId: "f31-veh-3", status: "ACTIVE" });
    assert.equal(activeInDb, 1, "real: caso 5 una sola Assignment ACTIVE por unidad");
    console.log("ok - real: caso 4 concurrencia + caso 5 una sola ACTIVE");

    console.log("F3_MONGO_REAL=PASSED");
  } finally {
    // ---------- Limpieza: elimina TODOS los datos creados ----------
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.dropDatabase();
        cleanupOk = true;
      }
    } catch (error) {
      console.log(`WARN cleanup dropDatabase: ${error.message}`);
    }
    await mongoose.disconnect().catch(() => undefined);
    await rs.stop().catch(() => undefined);
    console.log(`CLEANUP dropDatabase=${cleanupOk} replicaSetStopped=true`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
