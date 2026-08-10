const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const {
  canPublishVehicleTelemetry,
  ingestVehicleLocation
} = require("../src/services/vehicle-location-ingestion");

function fakeIo() {
  const events = [];
  const channel = { emit(name, payload) { events.push({ name, payload }); return channel; }, to() { return channel; } };
  return { ...channel, events };
}

async function main() {
  const store = createEmbeddedStore();
  const io = fakeIo();
  const actor = store.getUserById("user-driver-01");
  const timestamp = new Date().toISOString();
  const base = { vehicleId: "vehicle-101", coordinates: { latitude: 19.44, longitude: -99.13 },
    timestamp, accuracy: 8, packetId: "gps-contract-1" };
  const positionsBefore = store.listRouteSessions({ vehicleId: "vehicle-101", limit: 50 })
    .flatMap((session) => store.listRouteSessionPositions({ sessionId: session.id, limit: 100 }));
  assert.equal((await ingestVehicleLocation({ actor, io, payload: base, store, transport: "http" })).accepted, true);
  assert.ok(io.events.some((event) => event.name === "location:updated"));
  assert.ok(io.events.some((event) => event.name === "operational-unit:updated"));
  const positionsAfter = store.listRouteSessions({ vehicleId: "vehicle-101", limit: 50 })
    .flatMap((session) => store.listRouteSessionPositions({ sessionId: session.id, limit: 100 }));
  assert.equal(positionsAfter.length, positionsBefore.length);
  const eventCount = io.events.length;
  const duplicate = await ingestVehicleLocation({ actor, io, payload: base, store, transport: "socket" });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.decision, "duplicate");
  assert.equal(io.events.length, eventCount);
  assert.equal((await ingestVehicleLocation({ actor, io, payload: { ...base, packetId: "gps-contract-2",
    timestamp: new Date(Date.now() + 1000).toISOString(), coordinates: { latitude: 19.45, longitude: -99.12 } },
    store, transport: "http" })).accepted, true);
  const older = await ingestVehicleLocation({ actor, io, payload: { ...base, packetId: "gps-contract-3",
    coordinates: { latitude: 18, longitude: -98 } }, store, transport: "socket" });
  assert.equal(older.accepted, false);
  assert.equal(older.decision, "out_of_order");
  assert.deepEqual(store.getVehicleById("vehicle-101").location, { latitude: 19.45, longitude: -99.12 });
  await assert.rejects(
    () => ingestVehicleLocation({ actor: store.getUserById("user-driver-02"), io, payload: {
      ...base, packetId: "gps-contract-forbidden", timestamp: new Date(Date.now() + 2000).toISOString()
    }, store, transport: "http" }),
    (error) => error?.code === "forbidden_vehicle"
  );
  // Publicar telemetria GPS es propiedad operativa de la unidad, no
  // administracion. Ver/administrar tracking son autoridades distintas
  // (canViewAnalytics para /locations/live, canManageRoutes para rutas) y no
  // pasan por aqui.
  const admin = store.getUserById("user-admin-01");
  assert.equal(admin.role, "admin");
  assert.equal(admin.vehicleId, null, "el modelo no asigna unidad a un no-conductor");
  await assert.rejects(
    () => ingestVehicleLocation({ actor: admin, io, payload: {
      ...base, packetId: "gps-contract-admin", timestamp: new Date(Date.now() + 3000).toISOString()
    }, store, transport: "http" }),
    (error) => error?.code === "forbidden_vehicle"
  );

  const supervisor = store.getUserById("user-supervisor-01");
  await assert.rejects(
    () => ingestVehicleLocation({ actor: supervisor, io, payload: {
      ...base, packetId: "gps-contract-supervisor", timestamp: new Date(Date.now() + 4000).toISOString()
    }, store, transport: "socket" }),
    (error) => error?.code === "forbidden_vehicle"
  );

  // Cross-tenant se rechaza antes que la propiedad, aunque el actor declare
  // tener asignada esa misma unidad.
  await assert.rejects(
    () => ingestVehicleLocation({ actor: {
      id: "user-foreign-driver", role: "driver", organizationId: "otra-organizacion", vehicleId: "vehicle-101"
    }, io, payload: {
      ...base, packetId: "gps-contract-cross-tenant", timestamp: new Date(Date.now() + 5000).toISOString()
    }, store, transport: "http" }),
    (error) => error?.code === "cross_tenant_vehicle"
  );

  // Ninguno de los rechazos anteriores movio la posicion de la unidad.
  assert.deepEqual(store.getVehicleById("vehicle-101").location, { latitude: 19.45, longitude: -99.12 });

  assert.equal(canPublishVehicleTelemetry({ role: "driver", vehicleId: "vehicle-101" }, "vehicle-101"), true);
  assert.equal(canPublishVehicleTelemetry({ role: "admin", vehicleId: null }, "vehicle-101"), false);
  assert.equal(canPublishVehicleTelemetry({ role: "driver", vehicleId: "vehicle-102" }, "vehicle-101"), false);
  assert.equal(canPublishVehicleTelemetry(null, "vehicle-101"), false);

  console.log("vehicle location ingestion tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
