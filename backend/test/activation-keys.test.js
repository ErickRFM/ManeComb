const assert = require("node:assert/strict");
const { buildSubscription } = require("../src/services/portal-account");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

async function createTestServer() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({
      connected: false,
      mode: "embedded",
      message: "activation-key-test"
    })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  return {
    store,
    url: `http://127.0.0.1:${address.port}/api`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json();

  return {
    payload,
    status: response.status
  };
}

async function runActivationKeyFlow() {
  assert.equal(
    buildSubscription({
      activationStatus: "active",
      paymentStatus: "paid",
      status: "active",
      fleetSize: 4
    }).isActive,
    true,
    "una empresa ya activada debe conservar el mismo estado en Portal y registro"
  );
  const context = await createTestServer();
  const stamp = Date.now();
  const ownerEmail = `activation-owner-${stamp}@combis.app`;
  const password = "Ruta123!";

  try {
    const registerOwner = await requestJson(`${context.url}/auth/register`, {
      body: JSON.stringify({
        name: "Admin Plan Dos",
        email: ownerEmail,
        password,
        phone: "+52 55 1000 0000",
        companyName: "Plan Dos Combis",
        accountType: "company_owner"
      }),
      method: "POST"
    });

    assert.equal(registerOwner.status, 201);
    const token = registerOwner.payload.token;

    const keyWithoutPlan = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(keyWithoutPlan.status, 403);
    assert.match(keyWithoutPlan.payload.message, /plan de la empresa no est/i);

    const checkout = await requestJson(`${context.url}/commercial/checkout`, {
      body: JSON.stringify({
        companyName: "Plan Dos Combis",
        contactName: "Admin Plan Dos",
        email: ownerEmail,
        phone: "+52 55 1000 0000",
        planId: "starter-2",
        paymentMethod: "transfer"
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "activation-keys-checkout-0001"
      },
      method: "POST"
    });

    assert.equal(checkout.status, 201);

    await context.store.updateCommercialOrder(checkout.payload.data.id, {
      paymentStatus: "paid",
      activationStatus: "active",
      status: "active",
      paymentApprovedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString()
    });

    const firstVehicle = await context.store.createVehicle({
      organizationId: registerOwner.payload.user.organizationId,
      code: "CB-T01",
      plate: "TST-001-A",
      status: "available"
    });
    const secondVehicle = await context.store.createVehicle({
      organizationId: registerOwner.payload.user.organizationId,
      code: "CB-T02",
      plate: "TST-002-A",
      status: "available"
    });
    const inactiveVehicle = await context.store.createVehicle({
      organizationId: registerOwner.payload.user.organizationId,
      code: "CB-INACTIVA",
      plate: "TST-003-A",
      status: "inactive"
    });

    await context.store.deleteVehicle(inactiveVehicle.id);

    const subscriptionCapacity = await requestJson(`${context.url}/account/subscription`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    assert.equal(subscriptionCapacity.status, 200);
    assert.equal(subscriptionCapacity.payload.data.activeUnits, 2);
    assert.equal(subscriptionCapacity.payload.data.availableUnits, 0);

    const portalCapacity = await requestJson(`${context.url}/portal/overview`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    assert.equal(portalCapacity.status, 200);
    assert.equal(portalCapacity.payload.data.subscription.activeUnits, 2);
    assert.equal(portalCapacity.payload.data.metrics.activeUnits, 2);

    // Regresion: las keys creadas antes de persistir `orderId` deben resolver
    // la misma orden activa que Portal, no caer falsamente en plan inactivo.
    const legacyKey = await context.store.createActivationKey({
      key: `MNCB-LEGACY-${stamp}`,
      companyId: registerOwner.payload.user.organizationId,
      adminId: registerOwner.payload.user.id,
      planId: "starter-2",
      status: "available",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    const legacyValidation = await requestJson(`${context.url}/driver/activation/validate`, {
      body: JSON.stringify({ key: legacyKey.key }),
      method: "POST"
    });

    assert.equal(legacyValidation.status, 200);
    assert.equal(legacyValidation.payload.data.valid, true);
    assert.deepEqual(
      legacyValidation.payload.data.availableUnits.map((unit) => unit.id).sort(),
      [firstVehicle.id, secondVehicle.id].sort()
    );
    await context.store.updateActivationKey(legacyKey.id, { status: "revoked" });
    const revokedValidation = await requestJson(`${context.url}/driver/activation/validate`, {
      body: JSON.stringify({ key: legacyKey.key }),
      method: "POST"
    });

    assert.equal(revokedValidation.status, 409);
    assert.match(revokedValidation.payload.message, /revocada/i);

    const historicalOrder = await context.store.createCommercialOrder({
      companyName: "Plan Dos Combis",
      contactName: "Admin Plan Dos",
      email: ownerEmail,
      phone: "+52 55 1000 0000",
      planId: "starter-2",
      paymentMethod: "transfer",
      organizationId: registerOwner.payload.user.organizationId
    });
    const historicalOrderKey = await context.store.createActivationKey({
      key: `MNCB-HISTORICAL-${stamp}`,
      companyId: registerOwner.payload.user.organizationId,
      adminId: registerOwner.payload.user.id,
      planId: "starter-2",
      orderId: historicalOrder.id,
      status: "available",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    const historicalOrderValidation = await requestJson(`${context.url}/driver/activation/validate`, {
      body: JSON.stringify({ key: historicalOrderKey.key }),
      method: "POST"
    });

    assert.equal(historicalOrderValidation.status, 200);
    assert.equal(historicalOrderValidation.payload.data.planId, "starter-2");
    await context.store.deleteActivationKey(historicalOrderKey.id);

    const noExpiryKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      body: JSON.stringify({ expiresInDays: null }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(noExpiryKeyResponse.status, 201);
    assert.equal(noExpiryKeyResponse.payload.data.activationKey.status, "available");
    assert.equal(noExpiryKeyResponse.payload.data.activationKey.expiresAt, null);

    const noExpiryValidation = await requestJson(`${context.url}/driver/activation/validate`, {
      body: JSON.stringify({ key: noExpiryKeyResponse.payload.data.activationKey.key }),
      method: "POST"
    });

    assert.equal(noExpiryValidation.status, 200);
    assert.equal(noExpiryValidation.payload.data.valid, true);
    assert.equal(noExpiryValidation.payload.data.expiresAt, null);

    const deleteNoExpiryKey = await requestJson(
      `${context.url}/admin/activation-keys/${noExpiryKeyResponse.payload.data.activationKey.id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "DELETE"
      }
    );

    assert.equal(deleteNoExpiryKey.status, 200);
    assert.equal(deleteNoExpiryKey.payload.data.summary.keysAvailable, 0);

    const expiringKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(expiringKeyResponse.status, 201);
    await context.store.updateActivationKey(expiringKeyResponse.payload.data.activationKey.id, {
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
    });

    const expiredKeyUse = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: expiringKeyResponse.payload.data.activationKey.key,
        name: "Conductor Key Vencida",
        email: `conductor-expirado-${stamp}@combis.app`,
        password
      }),
      method: "POST"
    });

    assert.equal(expiredKeyUse.status, 409);
    assert.match(expiredKeyUse.payload.message, /key.*vencida/i);

    const firstKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });
    const secondKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(firstKeyResponse.status, 201);
    assert.equal(secondKeyResponse.status, 201);
    assert.equal(secondKeyResponse.payload.data.summary.keysGenerated, 4);
    assert.equal(secondKeyResponse.payload.data.summary.keysExpired, 1);
    assert.equal(secondKeyResponse.payload.data.summary.keysRevoked, 1);
    assert.equal(secondKeyResponse.payload.data.summary.keysAvailable, 2);
    assert.equal(secondKeyResponse.payload.data.summary.activeUnits, 2);
    assert.equal(secondKeyResponse.payload.data.summary.availableSlots, 0);

    const keyOne = firstKeyResponse.payload.data.activationKey.key;
    const keyTwo = secondKeyResponse.payload.data.activationKey.key;

    const ownerAsDriver = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: keyOne,
        name: "Admin No Debe Cambiar Rol",
        email: ownerEmail,
        password
      }),
      method: "POST"
    });

    assert.equal(ownerAsDriver.status, 409);
    assert.equal(ownerAsDriver.payload.code, "activation_account_role_conflict");
    assert.equal(
      ownerAsDriver.payload.message,
      "Este correo ya está registrado como cuenta administrativa. Para el conductor usa otro correo o número."
    );

    const firstDriver = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: keyOne,
        name: "Conductor Uno",
        email: `conductor-uno-${stamp}@combis.app`,
        password,
        unit: {
          vehicleId: firstVehicle.id
        }
      }),
      method: "POST"
    });

    assert.equal(firstDriver.status, 201);
    assert.equal(firstDriver.payload.user.role, "driver");
    assert.equal(firstDriver.payload.user.organizationId, registerOwner.payload.user.organizationId);
    assert.equal(firstDriver.payload.authContext.canAccessMobile, true);
    assert.equal(firstDriver.payload.canAccessMobile, true);
    assert.equal(firstDriver.payload.mobileBlockReason, null);
    assert.equal(firstDriver.payload.postLoginRoute, "/mapa");
    assert.equal(firstDriver.payload.subscription.status, "active");
    assert.equal(firstDriver.payload.subscription.unitsLimit, 2);
    assert.equal(firstDriver.payload.tenant.status, "active");
    assert.equal(firstDriver.payload.dashboard.fleet.length, 1);
    assert.equal(firstDriver.payload.dashboard.fleet[0].code, "CB-T01");

    const driverDashboard = await requestJson(`${context.url}/dashboard/overview`, {
      headers: {
        Authorization: `Bearer ${firstDriver.payload.token}`
      }
    });

    assert.equal(driverDashboard.status, 200);
    assert.equal(driverDashboard.payload.data.fleet.length, 1);
    assert.equal(driverDashboard.payload.data.fleet[0].code, "CB-T01");

    const foreignVehicleUpdate = await requestJson(`${context.url}/locations/update`, {
      body: JSON.stringify({
        vehicleId: "vehicle-101",
        coordinates: {
          latitude: 19.4326,
          longitude: -99.1332
        }
      }),
      headers: {
        Authorization: `Bearer ${firstDriver.payload.token}`
      },
      method: "POST"
    });

    assert.equal(foreignVehicleUpdate.status, 403);

    const reusedKey = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: keyOne,
        name: "Conductor Repetido",
        email: `conductor-repetido-${stamp}@combis.app`,
        password
      }),
      method: "POST"
    });

    assert.equal(reusedKey.status, 409);
    assert.equal(reusedKey.payload.message, "Esta key ya fue usada.");

    const secondDriver = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: keyTwo,
        name: "Conductor Dos",
        email: `conductor-dos-${stamp}@combis.app`,
        password,
        unit: {
          vehicleId: secondVehicle.id
        }
      }),
      method: "POST"
    });

    assert.equal(secondDriver.status, 201);

    const ownerDashboard = await requestJson(`${context.url}/dashboard/overview`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    assert.equal(ownerDashboard.status, 200);
    assert.deepEqual(
      ownerDashboard.payload.data.fleet.map((vehicle) => vehicle.code).sort(),
      ["CB-T01", "CB-T02"]
    );

    const thirdKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(thirdKeyResponse.status, 409);
    assert.match(thirdKeyResponse.payload.message, /l.mite de conductores/i);

    await context.store.updateUser(firstDriver.payload.user.id, {
      userStatus: "suspended"
    });

    const replacementKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(replacementKeyResponse.status, 201);
    assert.equal(replacementKeyResponse.payload.data.summary.keysAvailable, 1);
    assert.equal(replacementKeyResponse.payload.data.summary.remainingDriverSlots, 1);
    assert.equal(replacementKeyResponse.payload.data.summary.activeUnits, 2);

    const upgradeResponse = await requestJson(`${context.url}/account/subscription/plan`, {
      body: JSON.stringify({ planId: "value-4" }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "PATCH"
    });
    assert.equal(upgradeResponse.status, 200);
    assert.equal(upgradeResponse.payload.data.totalUnits, 4);
    assert.equal(upgradeResponse.payload.data.activeUnits, 2);

    const thirdVehicle = await context.store.createVehicle({
      organizationId: registerOwner.payload.user.organizationId,
      code: "CB-T03",
      plate: "TST-003-B",
      status: "available"
    });
    assert.ok(thirdVehicle.id);

    const blockedDowngrade = await requestJson(`${context.url}/account/subscription/plan`, {
      body: JSON.stringify({ planId: "starter-2" }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "PATCH"
    });
    assert.equal(blockedDowngrade.status, 409);
    assert.equal(blockedDowngrade.payload.code, "active_usage_exceeds_target");
    assert.equal(blockedDowngrade.payload.data.activeUnits, 3);
    assert.equal(blockedDowngrade.payload.data.targetUnits, 2);

    console.log("ok - flujo de activation keys respeta plan, flota registrada, contrato mobile y cupos");
  } finally {
    await context.close();
  }
}

runActivationKeyFlow().catch((error) => {
  console.error(error);
  process.exit(1);
});
