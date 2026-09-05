const assert = require('node:assert/strict');
const { createEmbeddedStore } = require('../src/data/store');
const { deleteVehicleSafely, retireVehicle } = require('../src/services/driver-lifecycle');
const { findVehicleIdentityConflict } = require('../src/modules/vehicles/identity-conflict');

async function run() {
  const store = createEmbeddedStore();
  const organizationId = `org-unit-identity-${Date.now()}`;

  const active = await store.createVehicle({
    organizationId,
    code: 'C-2',
    plate: 'FCR-854',
    status: 'available',
  });

  const activeConflict = await findVehicleIdentityConflict(store, {
    organizationId,
    code: 'c-2',
    plate: 'OTHER-001',
  });
  assert.equal(activeConflict?.code, 'vehicle_identity_conflict');
  assert.equal(activeConflict?.data?.vehicleId, active.id);
  assert.deepEqual(activeConflict?.data?.fields, ['code']);

  const historical = await store.createVehicle({
    organizationId,
    code: 'C-3',
    plate: 'PR3-456',
    status: 'available',
  });
  await retireVehicle(store, {
    actorId: 'owner-test',
    organizationId,
    reason: 'Renovacion de flota',
    vehicleId: historical.id,
  });

  const archivedConflict = await findVehicleIdentityConflict(store, {
    organizationId,
    code: 'C-3',
    plate: 'pr3-456',
  });
  assert.equal(archivedConflict?.code, 'vehicle_archived_identity_conflict');
  assert.match(archivedConflict?.message || '', /Mostrar retiradas/);
  assert.match(archivedConflict?.message || '', /historial y los documentos se conservaran/);
  assert.equal(archivedConflict?.data?.vehicles?.[0]?.vehicleId, historical.id);
  assert.deepEqual(archivedConflict?.data?.vehicles?.[0]?.fields, ['code', 'plate']);

  const crossTenant = await findVehicleIdentityConflict(store, {
    organizationId: `${organizationId}-otro`,
    code: 'C-3',
    plate: 'PR3-456',
  });
  assert.equal(crossTenant, null);

  const archivedDeleted = await deleteVehicleSafely(store, {
    organizationId,
    vehicleId: historical.id,
  });
  assert.equal(archivedDeleted.archiveDeleted, true);

  const releasedIdentity = await findVehicleIdentityConflict(store, {
    organizationId,
    code: 'C-3',
    plate: 'PR3-456',
  });
  assert.equal(releasedIdentity, null);

  const recreated = await store.createVehicle({
    organizationId,
    code: 'C-3',
    plate: 'PR3-456',
    status: 'available',
  });
  assert.notEqual(recreated.id, historical.id);
  assert.equal(recreated.code, 'C-3');

  console.log('vehicle identity conflict lifecycle tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
