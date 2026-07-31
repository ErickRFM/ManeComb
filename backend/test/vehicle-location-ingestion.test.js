const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const { ingestVehicleLocation } = require("../src/services/vehicle-location-ingestion");

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
  assert.equal((await ingestVehicleLocation({ actor, io, payload: base, store, transport: "http" })).accepted, true);
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
  console.log("vehicle location ingestion tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
