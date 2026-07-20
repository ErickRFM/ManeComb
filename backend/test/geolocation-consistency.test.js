const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");
const { normalizeTrackingTime } = require("../src/services/tracking-time");

(async () => {
  const store = createEmbeddedStore();
  const receivedAt = new Date("2026-07-19T12:00:00.000Z");
  const firstTime = normalizeTrackingTime("2026-07-19T12:00:00.000Z", receivedAt);

  await store.updateVehicleLocation({ vehicleId: "vehicle-101", coordinates: { latitude: 19.41, longitude: -99.11 }, timestamp: firstTime.processedTimestamp, temporal: firstTime });
  await store.updateVehicleLocation({ vehicleId: "vehicle-204", coordinates: { latitude: 20.67, longitude: -103.35 }, timestamp: firstTime.processedTimestamp, temporal: firstTime });

  const first = await store.getVehicleById("vehicle-101");
  const second = await store.getVehicleById("vehicle-204");
  assert.deepEqual(first.location, { latitude: 19.41, longitude: -99.11 });
  assert.deepEqual(second.location, { latitude: 20.67, longitude: -103.35 });

  const future = normalizeTrackingTime("2026-07-19T12:04:00.000Z", receivedAt);
  assert.equal(future.timestampSource, "client");

  const stale = normalizeTrackingTime("2026-07-19T11:59:00.000Z", new Date("2026-07-19T11:59:30.000Z"));
  await store.updateVehicleLocation({ vehicleId: "vehicle-101", coordinates: { latitude: 0, longitude: 0 }, timestamp: stale.processedTimestamp, temporal: stale });
  assert.deepEqual((await store.getVehicleById("vehicle-101")).location, first.location);

  console.log("geolocation consistency tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
