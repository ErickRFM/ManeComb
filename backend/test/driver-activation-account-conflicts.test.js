const assert = require("node:assert/strict");

const { createEmbeddedStore } = require("../src/data/store");
const {
  ACTIVATION_ERROR_CODES,
  registerDriverWithActivationKey
} = require("../src/services/activation-keys");

async function seedScenario(label) {
  const store = createEmbeddedStore();
  const suffix = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await store.registerUser({
    name: `Admin ${label}`,
    email: `owner-${suffix}@manecomb.test`,
    password: "Ruta123!",
    phone: "+52 55 1000 0000",
    companyName: `Empresa ${label}`,
    accountType: "company_owner"
  });
  const ownerUser = owner.user || owner;
  const organizationId = ownerUser.organizationId;
  const order = await store.createCommercialOrder({
    companyName: `Empresa ${label}`,
    contactName: ownerUser.name,
    email: ownerUser.email,
    phone: ownerUser.phone,
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
    code: `C-${label}`,
    plate: `TST-${label}`,
    status: "available"
  });
  const activationKey = await store.createActivationKey({
    key: `MNCB-${suffix}`.toUpperCase(),
    companyId: organizationId,
    adminId: ownerUser.id,
    planId: "starter-2",
    orderId: order.id,
    status: "available",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });

  return { activationKey, organizationId, ownerUser, store, suffix, vehicle };
}

async function captureActivationError(context, email) {
  try {
    await registerDriverWithActivationKey(context.store, {
      key: context.activationKey.key,
      name: "Conductor Conflicto",
      email,
      password: "Ruta123!",
      unit: { vehicleId: context.vehicle.id }
    });
  } catch (error) {
    return error;
  }

  assert.fail("La activación conflictiva no debe crear ni modificar una cuenta");
}

async function assertResourcesRemainAvailable(context) {
  const key = await context.store.findActivationKeyByKey(context.activationKey.key);
  const vehicle = await context.store.getVehicleById(context.vehicle.id);

  assert.equal(key.status, "available");
  assert.equal(key.usedByDriverId || null, null);
  assert.equal(vehicle.status, "available");
  assert.equal(vehicle.driverId || null, null);
}

function waitForBothReads(store) {
  const originalFindUserByEmail = store.findUserByEmail;
  let readCount = 0;
  let releaseReads;
  const bothReads = new Promise((resolve) => {
    releaseReads = resolve;
  });

  store.findUserByEmail = async (email) => {
    const result = await originalFindUserByEmail(email);
    readCount += 1;
    if (readCount === 2) {
      releaseReads();
    }
    await bothReads;
    return result;
  };
}

async function run() {
  const ownerConflict = await seedScenario("OWNER");
  const ownerError = await captureActivationError(ownerConflict, ownerConflict.ownerUser.email);
  assert.equal(ownerError.statusCode, 409);
  assert.equal(ownerError.code, ACTIVATION_ERROR_CODES.accountRoleConflict);
  assert.match(ownerError.message, /cuenta administrativa/i);
  await assertResourcesRemainAvailable(ownerConflict);

  const activeConflict = await seedScenario("ACTIVE");
  const activeDriver = await activeConflict.store.createUser({
    name: "Conductor Existente",
    email: `driver-${activeConflict.suffix}@manecomb.test`,
    password: "Ruta123!",
    role: "driver",
    organizationId: activeConflict.organizationId,
    userStatus: "active"
  }, "driver");
  const activeError = await captureActivationError(activeConflict, activeDriver.email);
  assert.equal(activeError.code, ACTIVATION_ERROR_CODES.accountExists);
  assert.match(activeError.message, /inicia sesión/i);
  await assertResourcesRemainAvailable(activeConflict);

  const suspendedConflict = await seedScenario("SUSPENDED");
  const suspendedDriver = await suspendedConflict.store.createUser({
    name: "Conductor Suspendido",
    email: `driver-${suspendedConflict.suffix}@manecomb.test`,
    password: "Ruta123!",
    role: "driver",
    organizationId: suspendedConflict.organizationId,
    userStatus: "suspended"
  }, "driver");
  const suspendedError = await captureActivationError(suspendedConflict, suspendedDriver.email);
  assert.equal(suspendedError.code, ACTIVATION_ERROR_CODES.accountSuspended);
  assert.match(suspendedError.message, /administrador.*reactive/i);
  await assertResourcesRemainAvailable(suspendedConflict);

  const tenantConflict = await seedScenario("TENANT");
  const foreignDriver = await tenantConflict.store.createUser({
    name: "Conductor Otro Tenant",
    email: `driver-${tenantConflict.suffix}@manecomb.test`,
    password: "Ruta123!",
    role: "driver",
    organizationId: "another-organization",
    userStatus: "active"
  }, "driver");
  const tenantError = await captureActivationError(tenantConflict, foreignDriver.email);
  assert.equal(tenantError.code, ACTIVATION_ERROR_CODES.accountTenantConflict);
  assert.match(tenantError.message, /otra cuenta ManeComb/i);
  await assertResourcesRemainAvailable(tenantConflict);

  const concurrent = await seedScenario("RACE");
  const secondVehicle = await concurrent.store.createVehicle({
    organizationId: concurrent.organizationId,
    code: "C-RACE-2",
    plate: "TST-RACE-2",
    status: "available"
  });
  const secondKey = await concurrent.store.createActivationKey({
    key: `MNCB-${concurrent.suffix}-SECOND`.toUpperCase(),
    companyId: concurrent.organizationId,
    adminId: concurrent.ownerUser.id,
    planId: "starter-2",
    orderId: concurrent.activationKey.orderId,
    status: "available",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  const sharedEmail = `race-${concurrent.suffix}@manecomb.test`;
  waitForBothReads(concurrent.store);

  const outcomes = await Promise.all([
    registerDriverWithActivationKey(concurrent.store, {
      key: concurrent.activationKey.key,
      name: "Conductor Carrera A",
      email: sharedEmail,
      password: "Ruta123!",
      unit: { vehicleId: concurrent.vehicle.id }
    }).then(
      (result) => ({ ok: true, key: concurrent.activationKey, result, vehicle: concurrent.vehicle }),
      (error) => ({ ok: false, error, key: concurrent.activationKey, vehicle: concurrent.vehicle })
    ),
    registerDriverWithActivationKey(concurrent.store, {
      key: secondKey.key,
      name: "Conductor Carrera B",
      email: sharedEmail,
      password: "Ruta123!",
      unit: { vehicleId: secondVehicle.id }
    }).then(
      (result) => ({ ok: true, key: secondKey, result, vehicle: secondVehicle }),
      (error) => ({ ok: false, error, key: secondKey, vehicle: secondVehicle })
    )
  ]);
  const winner = outcomes.find((entry) => entry.ok);
  const loser = outcomes.find((entry) => !entry.ok);

  assert.ok(winner);
  assert.ok(loser);
  assert.equal(loser.error.statusCode, 409);
  assert.equal(loser.error.code, ACTIVATION_ERROR_CODES.accountExists);
  const loserKey = await concurrent.store.findActivationKeyByKey(loser.key.key);
  const loserVehicle = await concurrent.store.getVehicleById(loser.vehicle.id);
  assert.equal(loserKey.status, "available");
  assert.equal(loserVehicle.status, "available");
  assert.equal(loserVehicle.driverId || null, null);

  const winnerKey = await concurrent.store.findActivationKeyByKey(winner.key.key);
  const winnerVehicle = await concurrent.store.getVehicleById(winner.vehicle.id);
  assert.equal(winnerKey.status, "used");
  assert.equal(winnerVehicle.driverId, winner.result.user.id);

  console.log("ok - conflictos de cuenta en activación son accionables y no consumen key/unidad");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
