const assert = require('node:assert/strict');
const { createEmbeddedStore } = require('../src/data/store');
const { generateActivationKeyForAdmin, listAdminActivationKeys, registerDriverWithActivationKey } = require('../src/services/activation-keys');
const {
  changeDriverVehicle, deleteDriverSafely, deleteVehicleSafely, offboardDriver,
  previewDriverLifecycleImpact, previewVehicleDeletionImpact, reactivateDriver,
  releaseDriverVehicle, retireVehicle,
} = require('../src/services/driver-lifecycle');
const { createSessionForRequest, listSessionsForUser } = require('../src/services/sessions');

async function seedFleet() {
  const store = createEmbeddedStore();
  const stamp = Date.now();
  const ownerResult = await store.registerUser({
    name: 'Admin Ciclo', email: `fleet-owner-${stamp}@combis.app`, password: 'Ruta123!',
    companyName: 'Flota Ciclo', accountType: 'company_owner',
  });
  const owner = ownerResult.user || ownerResult;
  const organizationId = owner.organizationId;
  const order = await store.createCommercialOrder({
    companyName: 'Flota Ciclo', contactName: owner.name, email: owner.email,
    phone: '+52 55 1000 0000', planId: 'starter-2', paymentMethod: 'transfer', organizationId,
  });
  await store.updateCommercialOrder(order.id, {
    paymentStatus: 'paid', activationStatus: 'active', status: 'active',
    paymentApprovedAt: new Date().toISOString(), activatedAt: new Date().toISOString(),
  });
  const vehicle = await store.createVehicle({ organizationId, code: 'C-1', plate: 'CIC-001', status: 'available' });
  const firstKey = await generateActivationKeyForAdmin(store, owner);
  const registration = await registerDriverWithActivationKey(store, {
    key: firstKey.activationKey.key, name: 'Conductor Uno',
    email: `fleet-driver-${stamp}@combis.app`, password: 'Ruta123!', unit: { vehicleId: vehicle.id },
  });
  return { store, owner, organizationId, vehicle, driver: registration.user, firstKey: firstKey.activationKey };
}

async function runLifecycleFlow() {
  const { store, owner, organizationId, vehicle, driver, firstKey } = await seedFleet();
  const driverDocument = await store.createDocument({
    organizationId, ownerType: 'driver', ownerId: driver.id, name: 'Licencia', category: 'license',
    expiresAt: '2030-01-01T00:00:00.000Z', storageKey: 'drivers/licencia-v1.pdf', mimeType: 'application/pdf',
  });
  const replacementDocument = await store.replaceDocument(driverDocument.id, {
    organizationId, name: 'Licencia renovada', expiresAt: '2031-01-01T00:00:00.000Z',
    storageKey: 'drivers/licencia-v2.pdf', mimeType: 'application/pdf',
  });
  assert.equal(store.listDocumentVersions(replacementDocument.id, { organizationId }).length, 2);
  assert.equal(store.listDocuments({ organizationId: 'otro-tenant', includeSuperseded: true }).length, 0);
  await createSessionForRequest({ headers: {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } }, driver);
  const impact = await previewDriverLifecycleImpact(store, { organizationId, userId: driver.id });
  assert.equal(impact.sessionsToRevoke, 1);
  assert.equal(impact.assignedVehicle.id, vehicle.id);

  const beforeRelease = await listAdminActivationKeys(store, owner);
  const released = await releaseDriverVehicle(store, { organizationId, userId: driver.id });
  assert.equal(released.user.vehicleId, null);
  assert.equal((await store.getVehicleById(vehicle.id)).driverId, null);
  assert.equal((await listAdminActivationKeys(store, owner)).summary.availableSlots, beforeRelease.summary.availableSlots);

  await changeDriverVehicle(store, { organizationId, userId: driver.id, vehicleId: vehicle.id });
  const offboarded = await offboardDriver(store, {
    actor: owner, actorId: owner.id, organizationId, reason: 'Baja laboral', releaseVehicle: true, userId: driver.id,
  });
  assert.equal(offboarded.user.userStatus, 'suspended');
  assert.equal(offboarded.releasedVehicle.driverId, null);
  assert.equal(offboarded.capacity.summary.availableSlots, 2);
  assert.equal((await listSessionsForUser(driver.id)).every((entry) => !entry.isActive), true);
  const storedFirstKey = await store.findActivationKeyByKey(firstKey.key);
  assert.equal(storedFirstKey.status, 'used');
  assert.equal(storedFirstKey.usedByDriverId, driver.id);
  assert.equal(storedFirstKey.usedByDriverState, 'offboarded');
  assert.equal(store.listDocumentVersions(replacementDocument.id, { organizationId }).length, 2);
  assert.equal(store.listDocuments({ organizationId }).some((entry) => entry.id === replacementDocument.id), true);
  assert.equal((await offboardDriver(store, {
    actor: owner, actorId: owner.id, organizationId, reason: 'Baja laboral', releaseVehicle: true, userId: driver.id,
  })).changed, false);

  const replacement = await generateActivationKeyForAdmin(store, owner);
  const reservedReplacement = await generateActivationKeyForAdmin(store, owner);
  assert.notEqual(replacement.activationKey.key, firstKey.key);
  const oldPresented = (await listAdminActivationKeys(store, owner)).keys.find((entry) => entry.id === firstKey.id);
  assert.equal(oldPresented.status, 'used');
  assert.notEqual(oldPresented.key, firstKey.key);
  assert.equal(oldPresented.usedByDriverState, 'offboarded');
  await assert.rejects(
    () => reactivateDriver(store, { actor: owner, organizationId: 'otro-tenant', userId: driver.id }),
    (error) => error.statusCode === 404,
  );
  await assert.rejects(
    () => reactivateDriver(store, { actor: owner, organizationId, userId: driver.id }),
    (error) => error.statusCode === 409 && error.code === 'capacity',
  );
  await store.deleteActivationKey(replacement.activationKey.id);
  await store.deleteActivationKey(reservedReplacement.activationKey.id);
  const reactivated = await reactivateDriver(store, { actor: owner, organizationId, userId: driver.id });
  assert.equal(reactivated.user.userStatus, 'active');
  assert.equal(reactivated.user.vehicleId, null);
  assert.equal(store.listDocumentVersions(replacementDocument.id, { organizationId }).length, 2);
  await offboardDriver(store, {
    actor: owner, actorId: owner.id, organizationId, reason: 'Baja definitiva', releaseVehicle: true, userId: driver.id,
  });
  const deleted = await deleteDriverSafely(store, {
    actorId: owner.id, confirmation: 'ELIMINAR', organizationId, reason: 'Fin de relacion laboral', userId: driver.id,
  });
  assert.ok(deleted.user.deletedAt);
  assert.equal((await store.findActivationKeyByKey(firstKey.key)).status, 'used');
  assert.equal(store.listDocumentVersions(replacementDocument.id, { organizationId }).length, 2);
}

async function runVehicleLifecycle() {
  const { store, owner, organizationId } = await seedFleet();
  const unused = await store.createVehicle({ organizationId, code: 'NUEVA', plate: 'NEW-001', status: 'available' });
  assert.equal((await previewVehicleDeletionImpact(store, { organizationId, vehicleId: unused.id })).canDeletePermanently, true);
  await deleteVehicleSafely(store, { organizationId, vehicleId: unused.id });
  assert.equal(await store.getVehicleById(unused.id), null);

  const historical = await store.createVehicle({ organizationId, code: 'HIST', plate: 'HIS-001', status: 'available' });
  const vehicleDocument = await store.createDocument({
    organizationId, ownerType: 'vehicle', ownerId: historical.id, name: 'Tarjeta de circulacion',
    category: 'registration', expiresAt: '2030-01-01T00:00:00.000Z', storageKey: 'vehicles/tarjeta.jpg', mimeType: 'image/jpeg',
  });
  const session = await store.createRouteSession({ organizationId, vehicleId: historical.id, driverId: owner.id });
  await store.updateRouteSession(session.id, { status: 'FINISHED', finishedAt: new Date().toISOString() });
  assert.equal((await previewVehicleDeletionImpact(store, { organizationId, vehicleId: historical.id })).mustRetire, true);
  await assert.rejects(() => deleteVehicleSafely(store, { organizationId, vehicleId: historical.id }), /retirarse/);
  const retired = await retireVehicle(store, { actorId: owner.id, organizationId, reason: 'Renovacion de flota', vehicleId: historical.id });
  assert.ok(retired.vehicle.retiredAt);
  assert.equal((await store.listVehiclesForOrganization(organizationId)).some((entry) => entry.id === historical.id), false);
  assert.equal((await store.listVehiclesForOrganization(organizationId, { includeRetired: true })).some((entry) => entry.id === historical.id), true);
  assert.equal(store.listDocuments({ organizationId }).some((entry) => entry.id === vehicleDocument.id), true);
}

async function runAssignmentRace() {
  const { store, organizationId } = await seedFleet();
  const target = await store.createVehicle({ organizationId, code: 'RACE', plate: 'RAC-001', status: 'available' });
  const first = await store.createUser({ name: 'A', email: `race-a-${Date.now()}@test.invalid`, password: 'Ruta123!', role: 'driver', organizationId });
  const second = await store.createUser({ name: 'B', email: `race-b-${Date.now()}@test.invalid`, password: 'Ruta123!', role: 'driver', organizationId });
  const outcomes = await Promise.allSettled([
    changeDriverVehicle(store, { organizationId, userId: first.id, vehicleId: target.id }),
    changeDriverVehicle(store, { organizationId, userId: second.id, vehicleId: target.id }),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((entry) => entry.status === 'rejected').length, 1);
  const users = await store.listUsers({ role: 'owner', accountType: 'company_owner', organizationId });
  assert.equal(users.filter((entry) => entry.vehicleId === target.id).length, 1);
  assert.ok([first.id, second.id].includes((await store.getVehicleById(target.id)).driverId));
}

async function main() {
  await runLifecycleFlow();
  await runVehicleLifecycle();
  await runAssignmentRace();
  console.log('ok - ciclo de conductor, cupos, keys, retiro y concurrencia protegido');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
