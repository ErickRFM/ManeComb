const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { filterLiveLocationsForTenant } = require("../src/modules/locations/routes");

async function createTestServer() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({
      connected: false,
      mode: "embedded",
      message: "tenant-isolation-test"
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

  return {
    payload: await response.json(),
    status: response.status
  };
}

function runLiveLocationRouteScopeContract() {
  const live = {
    updatedAt: new Date().toISOString(),
    center: { latitude: 19.4, longitude: -99.1 },
    vehicles: [
      {
        id: "vehicle-own",
        organizationId: "tenant-a",
        routeId: "route-own",
        locationTimestamp: new Date().toISOString()
      },
      {
        id: "vehicle-other",
        organizationId: "tenant-a",
        routeId: "route-other",
        locationTimestamp: new Date().toISOString()
      },
      {
        id: "vehicle-foreign",
        organizationId: "tenant-b",
        routeId: "route-foreign",
        locationTimestamp: new Date().toISOString()
      }
    ],
    routes: [
      { id: "route-own", organizationId: "tenant-a", name: "Ruta propia" },
      { id: "route-other", organizationId: "tenant-a", name: "Ruta ajena del tenant" },
      { id: "route-foreign", organizationId: "tenant-b", name: "Ruta de otro tenant" }
    ],
    incidents: []
  };

  const driverView = filterLiveLocationsForTenant(
    {
      id: "driver-own",
      role: "driver",
      accountType: "operations",
      organizationId: "tenant-a",
      vehicleId: "vehicle-own",
      userStatus: "active"
    },
    live
  );

  assert.deepEqual(driverView.vehicles.map((vehicle) => vehicle.id), ["vehicle-own"]);
  assert.deepEqual(driverView.routes.map((route) => route.id), ["route-own"]);

  const adminView = filterLiveLocationsForTenant(
    {
      id: "admin-a",
      role: "admin",
      accountType: "operations",
      organizationId: "tenant-a",
      userStatus: "active"
    },
    live
  );

  assert.deepEqual(adminView.vehicles.map((vehicle) => vehicle.id), ["vehicle-own", "vehicle-other"]);
  assert.deepEqual(adminView.routes.map((route) => route.id), ["route-own", "route-other"]);
}

async function runTenantIsolationFlow() {
  runLiveLocationRouteScopeContract();

  const context = await createTestServer();
  const stamp = Date.now();
  const companyName = `Aislamiento ${stamp}`;
  const email = `aislamiento-${stamp}@combis.app`;
  const password = "Ruta123!";

  try {
    const register = await requestJson(`${context.url}/auth/register`, {
      body: JSON.stringify({
        name: "Owner Aislamiento",
        email,
        password,
        phone: "+52 55 4000 0000",
        companyName,
        accountType: "company_owner"
      }),
      method: "POST"
    });

    assert.equal(register.status, 201);
    assert.equal(register.payload.dashboard, null);
    const token = register.payload.token;
    const owner = register.payload.user;
    const authHeaders = {
      Authorization: `Bearer ${token}`
    };

    const blockedDashboard = await requestJson(`${context.url}/dashboard/overview`, {
      headers: authHeaders
    });
    assert.equal(blockedDashboard.status, 403);
    assert.equal(blockedDashboard.payload.code, "PLAN_REQUIRED");

    const profileUpdate = await requestJson(`${context.url}/users/me`, {
      body: JSON.stringify({
        name: "Owner Aislamiento Actualizado",
        role: "admin",
        accountType: "operations",
        organizationId: "manecomb-demo",
        userStatus: "suspended",
        vehicleId: "vehicle-101"
      }),
      headers: authHeaders,
      method: "PATCH"
    });

    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.payload.data.name, "Owner Aislamiento Actualizado");
    assert.equal(profileUpdate.payload.data.role, "owner");
    assert.equal(profileUpdate.payload.data.accountType, "company_owner");
    assert.equal(profileUpdate.payload.data.organizationId, owner.organizationId);
    assert.equal(profileUpdate.payload.data.userStatus, "active");
    assert.equal(profileUpdate.payload.data.vehicleId, null);

    const checkout = await requestJson(`${context.url}/commercial/checkout`, {
      body: JSON.stringify({
        companyName,
        contactName: "Owner Aislamiento",
        email,
        phone: "+52 55 4000 0000",
        planId: "starter-2",
        paymentMethod: "transfer",
        requestTrial: true
      }),
      headers: { ...authHeaders, "Idempotency-Key": `tenant-checkout-${stamp}` },
      method: "POST"
    });

    assert.equal(checkout.status, 201);

    const dashboard = await requestJson(`${context.url}/dashboard/overview`, {
      headers: authHeaders
    });
    assert.equal(dashboard.status, 200);
    assert.deepEqual(dashboard.payload.data.fleet, []);

    const foreignTrips = await requestJson(
      `${context.url}/navigation/trips?vehicleId=vehicle-101`,
      { headers: authHeaders }
    );
    assert.equal(foreignTrips.status, 404);

    const foreignIncident = await requestJson(`${context.url}/incidents`, {
      body: JSON.stringify({
        title: "Incidencia cruzada",
        type: "security",
        description: "No debe aceptar unidad ajena",
        severity: "high",
        vehicleId: "vehicle-101"
      }),
      headers: authHeaders,
      method: "POST"
    });
    assert.equal(foreignIncident.status, 404);

    const manualDriver = await requestJson(`${context.url}/users`, {
      body: JSON.stringify({
        name: "Chofer Manual",
        email: `chofer-manual-${stamp}@combis.app`,
        password,
        role: "driver"
      }),
      headers: authHeaders,
      method: "POST"
    });
    assert.equal(manualDriver.status, 409);

    const foreignConversation = await requestJson(`${context.url}/chat/conversations/direct`, {
      body: JSON.stringify({
        targetUserId: "user-admin-01",
        channelMode: "chat"
      }),
      headers: authHeaders,
      method: "POST"
    });
    assert.equal(foreignConversation.status, 400);

    const foreignNotification = context.store.createNotification({
      organizationId: "manecomb-demo",
      title: "Notificacion ajena",
      body: "No debe filtrarse por targetUserIds",
      targetUserIds: [owner.id]
    });
    const notifications = await requestJson(`${context.url}/notifications`, {
      headers: authHeaders
    });
    assert.equal(notifications.status, 200);
    assert.equal(
      notifications.payload.data.some((notification) => notification.id === foreignNotification.id),
      false
    );

    const markForeignNotification = await requestJson(
      `${context.url}/notifications/${foreignNotification.id}/read`,
      {
        headers: authHeaders,
        method: "POST"
      }
    );
    assert.equal(markForeignNotification.status, 404);

    console.log("ok - aislamiento tenant bloquea datos, mutaciones y notificaciones cruzadas");
  } finally {
    await context.close();
  }
}

runTenantIsolationFlow().catch((error) => {
  console.error(error);
  process.exit(1);
});
