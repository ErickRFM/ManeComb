const assert = require("node:assert/strict");

const { createEmbeddedStore } = require("../src/data/store");
const { registerDriverWithActivationKey } = require("../src/services/activation-keys");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * El store embebido resuelve todo de forma sincrona, asi que dos peticiones HTTP
 * concurrentes terminan serializandose y la carrera no se reproduce. Mongo hace
 * I/O real en cada llamada, por lo que aqui se envuelve el store con latencia
 * para ejercitar la ventana entre "leer disponibilidad" y "escribir asignacion".
 */
function withLatency(store, ms = 5) {
  return new Proxy(store, {
    get(target, prop) {
      const value = target[prop];

      if (typeof value !== "function") {
        return value;
      }

      return async (...args) => {
        await sleep(ms);
        return value.apply(target, args);
      };
    }
  });
}

async function seedCompanyWithOneUnit(store) {
  const stamp = Date.now();
  const owner = await store.registerUser({
    name: "Admin Concurrencia",
    email: `unit-race-owner-${stamp}@combis.app`,
    password: "Ruta123!",
    phone: "+52 55 1000 0000",
    companyName: "Concurrencia Combis",
    accountType: "company_owner"
  });
  const organizationId = owner.user?.organizationId || owner.organizationId;

  const order = await store.createCommercialOrder({
    companyName: "Concurrencia Combis",
    contactName: "Admin Concurrencia",
    email: owner.user?.email || owner.email,
    phone: "+52 55 1000 0000",
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
    code: "C-1",
    plate: "ABC-123-A",
    status: "available"
  });

  const keys = [];

  for (let index = 0; index < 2; index += 1) {
    keys.push(
      await store.createActivationKey({
        key: `MNCB-RACE00-00000${index}-${String(stamp).slice(-6)}`,
        companyId: organizationId,
        adminId: owner.user?.id || owner.id,
        planId: "starter-2",
        orderId: order.id,
        status: "available",
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      })
    );
  }

  return { organizationId, vehicle, keys };
}

async function runConcurrentUnitClaim() {
  const store = createEmbeddedStore();
  const { organizationId, vehicle, keys } = await seedCompanyWithOneUnit(store);
  const slowStore = withLatency(store, 5);
  const stamp = Date.now();

  const attempt = (activationKey, name, email) =>
    registerDriverWithActivationKey(slowStore, {
      key: activationKey.key,
      name,
      email,
      password: "Ruta123!",
      unit: { vehicleId: vehicle.id }
    }).then(
      (result) => ({ ok: true, result }),
      (error) => ({ ok: false, status: error.statusCode, message: error.message })
    );

  // Ambos conductores vieron la misma unidad libre al validar su key.
  const outcomes = await Promise.all([
    attempt(keys[0], "Conductor A", `unit-race-a-${stamp}@combis.app`),
    attempt(keys[1], "Conductor B", `unit-race-b-${stamp}@combis.app`)
  ]);

  const winners = outcomes.filter((entry) => entry.ok);
  const losers = outcomes.filter((entry) => !entry.ok);

  assert.equal(winners.length, 1, "solo un conductor debe obtener la unidad");
  assert.equal(losers.length, 1, "el otro conductor debe ser rechazado");

  const finalVehicle = await store.getVehicleById(vehicle.id);
  const users = await store.listUsers({
    role: "owner",
    accountType: "company_owner",
    organizationId
  });
  const claimants = users.filter((entry) => entry.vehicleId === vehicle.id);

  assert.equal(claimants.length, 1, "solo un conductor debe quedar apuntando a la unidad");
  assert.equal(finalVehicle.driverId, claimants[0].id, "la unidad debe apuntar al ganador");
  assert.equal(finalVehicle.status, "assigned");

  // El perdedor recibe un mensaje accionable y no se le consume la key.
  assert.equal(losers[0].status, 409);
  assert.match(losers[0].message, /ya no est. disponible/i);

  const loserKey = winners[0].result.activationKey.key === keys[0].key ? keys[1] : keys[0];
  const storedLoserKey = await store.findActivationKeyByKey(loserKey.key);

  assert.equal(storedLoserKey.status, "available", "la key del perdedor no debe consumirse");

  // Y debe poder reintentar contra otra unidad.
  const secondVehicle = await store.createVehicle({
    organizationId,
    code: "C-2",
    plate: "XYZ-987-B",
    status: "available"
  });
  const retry = await registerDriverWithActivationKey(store, {
    key: loserKey.key,
    name: "Conductor Perdedor",
    email: `unit-race-retry-${stamp}@combis.app`,
    password: "Ruta123!",
    unit: { vehicleId: secondVehicle.id }
  });

  assert.equal(retry.user.vehicleId, secondVehicle.id, "el perdedor debe poder tomar otra unidad");

  console.log("ok - dos registros concurrentes por la misma unidad: solo uno gana y el perdedor conserva su key");
}

runConcurrentUnitClaim().catch((error) => {
  console.error(error);
  process.exit(1);
});
