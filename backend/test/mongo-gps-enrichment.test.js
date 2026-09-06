// Actual Mongo adapter with asynchronous model doubles. No database connection,
// environment URI, seed writes or production data; Mongo atomicity is not tested here.
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const models = require('../src/data/models');
const { createMongoStore } = require('../src/data/mongo-store');
const { buildOperationalUnitSnapshot } = require('../src/domain/operational-unit-snapshot');
const { emitOperationalUnitUpdate, clearGpsFreshnessDeadline } = require('../src/services/operational-units-service');

async function main() {
  assert.equal(mongoose.connection.readyState, 0, 'test must never connect to a database');
  const restore = [];
  const replace = (model, key, value) => {
    const original = model[key];
    model[key] = value;
    restore.push(() => { model[key] = original; });
  };
  const query = value => ({ lean: async () => value });
  const now = new Date('2026-09-06T00:00:00.000Z');
  let current = { _id: 'gps-test-vehicle', code: 'C-TEST', organizationId: 'gps-test-org',
    driverId: 'gps-test-driver', status: 'assigned', routeId: null,
    location: { latitude: 19.4, longitude: -99.1 },
    locationTimestamp: new Date(now.getTime() - 60000),
    locationReceivedAt: new Date(now.getTime() - 60000),
    updatedAt: new Date(now.getTime() - 60000) };
  let rejectUpdate = false;
  let driverLookupCompleted = false;
  let emittedVehicle;
  const driver = { _id: 'gps-test-driver', name: 'Test driver', role: 'driver',
    vehicleId: current._id, organizationId: current.organizationId };
  try {
    // Stub every query in ensureMongoSeedData before constructing the actual adapter.
    for (const model of [models.UserModel, models.RouteModel, models.VehicleModel,
      models.IncidentModel, models.ConversationModel, models.DocumentModel,
      models.NotificationModel, models.TripLogModel, models.CommercialLeadModel]) {
      replace(model, 'countDocuments', async () => 1);
    }
    replace(models.RouteModel, 'deleteMany', async () => ({ deletedCount: 0 }));
    replace(models.VehicleModel, 'updateMany', async () => ({ modifiedCount: 0 }));
    replace(models.IncidentModel, 'updateMany', async () => ({ modifiedCount: 0 }));
    replace(models.VehicleModel, 'findById', () => query(current));
    replace(models.VehicleModel, 'findOneAndUpdate', (filter, update, options) => {
      assert.equal(filter._id, current._id);
      assert.ok(filter.$or.some(clause => clause.locationTimestamp?.$lte));
      assert.equal(options.returnDocument, 'after');
      if (rejectUpdate) return query(null);
      current = { ...current, ...update.$set };
      return query(current);
    });
    replace(models.UserModel, 'findById', () => ({
      lean: () => new Promise(resolve => setImmediate(() => {
        driverLookupCompleted = true;
        resolve(driver);
      })),
    }));
    const store = await createMongoStore();
    const payload = { vehicleId: current._id, coordinates: current.location,
      timestamp: now.toISOString(), packetId: 'gps-test-packet',
      temporal: { receivedAt: now.toISOString(), timestampSource: 'client' } };
    const accepted = await store.updateVehicleLocation(payload);
    assert.equal(accepted.id, current._id, 'accepted update must contain resolved vehicle identity');
    assert.equal(driverLookupCompleted, true, 'enrichment must finish before returning the update');
    assert.equal(accepted.driver.id, driver._id);
    assert.equal(accepted.organizationId, current.organizationId);
    assert.deepEqual(accepted.location, current.location);
    assert.equal(new Date(accepted.locationReceivedAt).toISOString(), now.toISOString());
    assert.equal(accepted.locationUpdateApplied, true);
    assert.equal(accepted.locationUpdateReason, 'accepted');
    emittedVehicle = accepted;

    const before = accepted.locationReceivedAt;
    rejectUpdate = true;
    const duplicate = await store.updateVehicleLocation(payload);
    assert.equal(duplicate.id, accepted.id);
    assert.equal(duplicate.locationUpdateApplied, false);
    assert.equal(duplicate.locationUpdateReason, 'duplicate');
    assert.equal(duplicate.locationReceivedAt, before);
    const old = await store.updateVehicleLocation({ ...payload, packetId: 'older-packet',
      timestamp: new Date(now.getTime() - 60000).toISOString() });
    assert.equal(old.id, accepted.id);
    assert.equal(old.locationUpdateApplied, false);
    assert.equal(old.locationUpdateReason, 'out_of_order');
    assert.equal(old.locationReceivedAt, before);

    // The exact return value must also build a usable realtime snapshot, not an
    // empty-identity/never-reported object, with the same GPS as persisted data.
    const baseline = buildOperationalUnitSnapshot({ vehicle: accepted, driver: accepted.driver, now });
    assert.equal(baseline.unitId, accepted.id);
    assert.equal(baseline.gps.connectionState, 'live');
    const events = [];
    const io = { to: room => ({ emit: (name, payload) => { events.push({ room, name, payload }); } }) };
    const snapshotStore = { listRouteSessions: async () => [], listIncidents: async () => [],
      getUserById: async () => accepted.driver, getVehicleById: async () => accepted };
    await emitOperationalUnitUpdate({ io, store: snapshotStore, vehicle: accepted,
      organizationId: accepted.organizationId, getRolesWithPermission: () => ['owner'] });
    clearGpsFreshnessDeadline(accepted.organizationId, accepted.id);
    assert.ok(events.length > 0);
    for (const event of events) {
      assert.equal(event.name, 'operational-unit:updated');
      assert.equal(event.payload.unit.unitId, accepted.id);
      assert.equal(event.payload.unit.gps.receivedAt, baseline.gps.receivedAt);
      assert.equal(event.payload.unit.gps.recordedAt, baseline.gps.recordedAt);
      assert.equal(event.payload.unit.gps.lat, baseline.gps.lat);
    }
    assert.equal(mongoose.connection.readyState, 0);
    console.log('ok - Mongo GPS enrichment awaits identity/driver/telemetry; accepted, duplicate, out-of-order and realtime snapshot');
  } finally {
    if (emittedVehicle) clearGpsFreshnessDeadline(emittedVehicle.organizationId, emittedVehicle.id);
    restore.reverse().forEach(fn => fn());
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
