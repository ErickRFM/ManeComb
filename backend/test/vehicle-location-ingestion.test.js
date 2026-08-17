const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const {
  GPS_STATIONARY_JITTER_METERS,
  distanceInMeters,
  stabilizeGpsPosition
} = require("../src/services/gps-position-stabilizer");
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
  assert.equal(GPS_STATIONARY_JITTER_METERS, 8);
  const stable = { latitude: 19.44, longitude: -99.13 };
  const jitter = { latitude: 19.44002, longitude: -99.13 };
  const movement = { latitude: 19.4402, longitude: -99.13 };
  assert.ok(distanceInMeters(stable, jitter) < GPS_STATIONARY_JITTER_METERS);
  assert.ok(distanceInMeters(stable, movement) > GPS_STATIONARY_JITTER_METERS);
  assert.deepEqual(stabilizeGpsPosition(stable, jitter), {
    kind: "heartbeat",
    coordinates: stable,
    distanceMeters: distanceInMeters(stable, jitter),
    stabilized: true,
    thresholdMeters: GPS_STATIONARY_JITTER_METERS
  });
  assert.equal(stabilizeGpsPosition(stable, movement).kind, "movement");

  const store = createEmbeddedStore();
  const io = fakeIo();
  const actor = store.getUserById("user-driver-01");
  const timestampMs = Date.now();
  const timestamp = new Date(timestampMs).toISOString();
  const base = { vehicleId: "vehicle-101", coordinates: { latitude: 19.44, longitude: -99.13 },
    timestamp, accuracy: 8, packetId: "gps-contract-1" };
  const positionsBefore = store.listRouteSessions({ vehicleId: "vehicle-101", limit: 50 })
    .flatMap((session) => store.listRouteSessionPositions({ sessionId: session.id, limit: 100 }));
  const first = await ingestVehicleLocation({ actor, io, payload: base, store, transport: "http" });
  assert.equal(first.accepted, true);
  assert.ok(["initial", "movement", "heartbeat"].includes(first.positionDecision.kind));
  assert.equal(io.events.some((event) => event.name === "location:updated"), false);
  assert.ok(io.events.some((event) => event.name === "operational-unit:updated"));
  const positionsAfter = store.listRouteSessions({ vehicleId: "vehicle-101", limit: 50 })
    .flatMap((session) => store.listRouteSessionPositions({ sessionId: session.id, limit: 100 }));
  assert.equal(positionsAfter.length, positionsBefore.length);

  // La duplicidad se prueba antes de avanzar el reloj de la unidad: un mismo
  // packetId/timestamp debe seguir siendo duplicate, no confundirse con el
  // out-of-order legítimo que se prueba más abajo.
  const eventCountBeforeDuplicate = io.events.length;
  const duplicate = await ingestVehicleLocation({ actor, io, payload: base, store, transport: "socket" });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.decision, "duplicate");
  assert.equal(io.events.length, eventCountBeforeDuplicate);

  const anchor = { ...store.getVehicleById("vehicle-101").location };
  const smallDrift = {
    latitude: anchor.latitude + 0.00002,
    longitude: anchor.longitude
  };
  const eventCountBeforeHeartbeat = io.events.length;
  const heartbeat = await ingestVehicleLocation({
    actor,
    io,
    payload: {
      ...base,
      packetId: "gps-contract-heartbeat",
      timestamp: new Date(timestampMs + 1000).toISOString(),
      coordinates: smallDrift
    },
    store,
    transport: "http"
  });
  assert.equal(heartbeat.accepted, true);
  assert.equal(heartbeat.decision, "accepted");
  assert.equal(heartbeat.positionDecision.kind, "heartbeat");
  assert.equal(heartbeat.positionDecision.stabilized, true);
  assert.ok(heartbeat.positionDecision.distanceMeters < GPS_STATIONARY_JITTER_METERS);
  assert.deepEqual(store.getVehicleById("vehicle-101").location, anchor,
    "un heartbeat renueva vida GPS sin mover la posicion estable");
  assert.ok(io.events.length > eventCountBeforeHeartbeat,
    "el heartbeat estabilizado sigue emitiendo actualizacion en tiempo real");
  const liveHeartbeatEvent = io.events.slice(eventCountBeforeHeartbeat)
    .find((event) => event.name === "operational-unit:updated" && event.payload?.unit?.unitId === "vehicle-101");
  assert.ok(liveHeartbeatEvent, "el heartbeat debe publicar el snapshot operacional");
  assert.equal(liveHeartbeatEvent.payload.unit.gps.connectionState, "live");
  assert.equal(liveHeartbeatEvent.payload.unit.gps.lat, anchor.latitude);
  assert.equal(liveHeartbeatEvent.payload.unit.gps.lng, anchor.longitude);

  const realMovement = {
    latitude: anchor.latitude + 0.0002,
    longitude: anchor.longitude
  };
  const moved = await ingestVehicleLocation({
    actor,
    io,
    payload: {
      ...base,
      packetId: "gps-contract-2",
      timestamp: new Date(timestampMs + 2000).toISOString(),
      coordinates: realMovement
    },
    store,
    transport: "http"
  });
  assert.equal(moved.accepted, true);
  assert.equal(moved.positionDecision.kind, "movement");
  assert.deepEqual(store.getVehicleById("vehicle-101").location, realMovement,
    "al superar el radio de jitter la unidad debe avanzar");

  const older = await ingestVehicleLocation({ actor, io, payload: { ...base, packetId: "gps-contract-3",
    coordinates: { latitude: 18, longitude: -98 } }, store, transport: "socket" });
  assert.equal(older.accepted, false);
  assert.equal(older.decision, "out_of_order");
  assert.deepEqual(store.getVehicleById("vehicle-101").location, realMovement);
  await assert.rejects(
    () => ingestVehicleLocation({ actor: store.getUserById("user-driver-02"), io, payload: {
      ...base, packetId: "gps-contract-forbidden", timestamp: new Date(timestampMs + 3000).toISOString()
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
      ...base, packetId: "gps-contract-admin", timestamp: new Date(timestampMs + 4000).toISOString()
    }, store, transport: "http" }),
    (error) => error?.code === "forbidden_vehicle"
  );

  const supervisor = store.getUserById("user-supervisor-01");
  await assert.rejects(
    () => ingestVehicleLocation({ actor: supervisor, io, payload: {
      ...base, packetId: "gps-contract-supervisor", timestamp: new Date(timestampMs + 5000).toISOString()
    }, store, transport: "socket" }),
    (error) => error?.code === "forbidden_vehicle"
  );

  // Cross-tenant se rechaza antes que la propiedad, aunque el actor declare
  // tener asignada esa misma unidad.
  await assert.rejects(
    () => ingestVehicleLocation({ actor: {
      id: "user-foreign-driver", role: "driver", organizationId: "otra-organizacion", vehicleId: "vehicle-101"
    }, io, payload: {
      ...base, packetId: "gps-contract-cross-tenant", timestamp: new Date(timestampMs + 6000).toISOString()
    }, store, transport: "http" }),
    (error) => error?.code === "cross_tenant_vehicle"
  );

  // Ninguno de los rechazos anteriores movio la posicion de la unidad.
  assert.deepEqual(store.getVehicleById("vehicle-101").location, realMovement);

  assert.equal(canPublishVehicleTelemetry({ role: "driver", vehicleId: "vehicle-101" }, "vehicle-101"), true);
  assert.equal(canPublishVehicleTelemetry({ role: "admin", vehicleId: null }, "vehicle-101"), false);
  assert.equal(canPublishVehicleTelemetry({ role: "driver", vehicleId: "vehicle-102" }, "vehicle-101"), false);
  assert.equal(canPublishVehicleTelemetry(null, "vehicle-101"), false);

  console.log("vehicle location ingestion tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
