const assert = require("node:assert/strict");

const { createEmbeddedStore } = require("../src/data/store");
const { registerDriverWithActivationKey } = require("../src/services/activation-keys");

async function main() {
  const store = createEmbeddedStore();
  const stamp = Date.now();
  const organizationId = `rollback-${stamp}`;
  const driverIdKey = `MNCB-ROLLBACK-${stamp}`;

  const order = await store.createCommercialOrder({
    companyName: "Rollback Transportes",
    contactName: "Owner Rollback",
    email: `owner-${stamp}@manecomb.test`,
    phone: "+52 55 0000 0000",
    planId: "starter-2",
    paymentMethod: "transfer",
    organizationId
  });

  await store.updateCommercialOrder(order.id, {
    paymentStatus: "paid",
    activationStatus: "active",
    status: "active",
    paymentApprovedAt: new Date().toISOString(),
    activatedAt: new Date().toISOString()
  });

  const vehicle = await store.createVehicle({
    organizationId,
    code: "RB-01",
    plate: "RBK-001-A",
    status: "available"
  });

  const activationKey = await store.createActivationKey({
    key: driverIdKey,
    companyId: organizationId,
    adminId: "owner-rollback",
    planId: "starter-2",
    orderId: order.id,
    status: "available",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  });

  const originalCreateUser = store.createUser;
  store.createUser = async () => {
    throw new Error("simulated user persistence failure");
  };

  await assert.rejects(
    registerDriverWithActivationKey(store, {
      key: activationKey.key,
      name: "Chofer Rollback",
      email: `driver-${stamp}@manecomb.test`,
      phone: "+52 55 1111 1111",
      password: "Ruta123!",
      unit: { vehicleId: vehicle.id }
    }),
    /simulated user persistence failure/
  );

  store.createUser = originalCreateUser;

  const restoredKey = await store.findActivationKeyByKey(activationKey.key);
  assert.equal(restoredKey.status, "available", "failed registration must restore the key to available");
  assert.equal(restoredKey.usedByDriverId || null, null, "failed registration must clear usedByDriverId");
  assert.equal(restoredKey.usedByDriverState || null, null, "failed registration must clear driver state");
  assert.equal(restoredKey.usedAt || null, null, "failed registration must clear usedAt");

  const restoredVehicle = await store.getVehicleById(vehicle.id);
  assert.equal(restoredVehicle.driverId || null, null, "failed registration must release the claimed unit");
  assert.equal(restoredVehicle.status, "available", "released unit must remain available for retry");

  const secondVehicle = await store.createVehicle({
    organizationId,
    code: "RB-02",
    plate: "RBK-002-A",
    status: "available"
  });

  const successful = await registerDriverWithActivationKey(store, {
    key: activationKey.key,
    name: "Chofer Rollback",
    email: `driver-${stamp}@manecomb.test`,
    phone: "+52 55 1111 1111",
    password: "Ruta123!",
    unit: { vehicleId: secondVehicle.id }
  });

  assert.equal(successful.user.role, "driver");
  assert.equal(successful.user.organizationId, organizationId);
  assert.equal(successful.vehicle.id, secondVehicle.id);

  const consumedKey = await store.findActivationKeyByKey(activationKey.key);
  assert.equal(consumedKey.status, "used", "the restored key can be consumed by the successful retry");
  assert.equal(consumedKey.usedByDriverId, successful.user.id);

  const thirdVehicle = await store.createVehicle({
    organizationId,
    code: "RB-03",
    plate: "RBK-003-A",
    status: "available"
  });
  const secondKey = await store.createActivationKey({
    key: `MNCB-STARTER-SYNC-${stamp}`,
    companyId: organizationId,
    adminId: "owner-rollback",
    planId: "starter-2",
    orderId: order.id,
    status: "available",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  });

  const originalUpdateCommercialOrder = store.updateCommercialOrder;
  store.updateCommercialOrder = async () => {
    throw new Error("simulated starter fleet sync failure");
  };

  const committedDespiteStarterSync = await registerDriverWithActivationKey(store, {
    key: secondKey.key,
    name: "Chofer Sync Degradado",
    email: `driver-sync-${stamp}@manecomb.test`,
    phone: "+52 55 2222 2222",
    password: "Ruta123!",
    unit: { vehicleId: thirdVehicle.id }
  });

  store.updateCommercialOrder = originalUpdateCommercialOrder;

  assert.equal(committedDespiteStarterSync.user.role, "driver");
  assert.equal(committedDespiteStarterSync.vehicle.id, thirdVehicle.id);

  const committedKey = await store.findActivationKeyByKey(secondKey.key);
  assert.equal(committedKey.status, "used", "starter fleet sync failure must not roll back a persisted driver");
  assert.equal(committedKey.usedByDriverId, committedDespiteStarterSync.user.id);

  const committedVehicle = await store.getVehicleById(thirdVehicle.id);
  assert.equal(committedVehicle.driverId, committedDespiteStarterSync.user.id);

  const persistedUser = await store.getUserById(committedDespiteStarterSync.user.id);
  assert.equal(persistedUser.email, committedDespiteStarterSync.user.email);

  console.log("ok - activation rollback is safe before commit and starter fleet sync is best-effort after commit");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
