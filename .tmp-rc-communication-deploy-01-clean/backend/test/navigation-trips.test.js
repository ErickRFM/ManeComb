const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { toServiceDate } = require("../src/utils/service-date");
const { signToken } = require("../src/utils/jwt");

async function createTestServer() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({
      connected: false,
      mode: "embedded",
      message: "test"
    })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const adminUser = store.getUserById("user-admin-01");

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    store,
    token: signToken(adminUser),
    url: `http://127.0.0.1:${address.port}/api`
  };
}

async function requestJson(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  return {
    payload: await response.json(),
    status: response.status
  };
}

async function testListTripsByVehicleAndServiceDate() {
  const context = await createTestServer();

  try {
    const existingLogs = context.store.listTripLogs({
      limit: 12,
      vehicleId: "vehicle-101"
    });
    const serviceDate = existingLogs[0]?.serviceDate;
    const { payload, status } = await requestJson(
      `${context.url}/navigation/trips?vehicleId=vehicle-101&date=${serviceDate}&limit=12`,
      context.token
    );

    assert.equal(status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.vehicleId, "vehicle-101");
    assert.equal(payload.data.serviceDate, serviceDate);
    assert.equal(payload.data.logs.length, 2);
    assert.ok(payload.data.logs.every((entry) => entry.serviceDate === serviceDate));
    console.log("ok - GET /api/navigation/trips filtra por unidad y fecha operativa");
  } finally {
    await context.close();
  }
}

async function testDeduplicateTripLogCreation() {
  const context = await createTestServer();

  try {
    const existingLogs = context.store.listTripLogs({
      limit: 12,
      vehicleId: "vehicle-101"
    });
    const serviceDate = existingLogs[0]?.serviceDate || toServiceDate(new Date());
    const tripPayload = {
      vehicleId: "vehicle-101",
      vehicleCode: "CB-101",
      serviceDate,
      originLabel: "Pantitlan",
      destinationLabel: "Tacuba",
      origin: {
        latitude: 19.415,
        longitude: -99.073
      },
      destination: {
        latitude: 19.4452,
        longitude: -99.1513
      },
      startedAt: `${serviceDate}T10:00:00.000Z`,
      finishedAt: `${serviceDate}T10:28:00.000Z`,
      durationSeconds: 1680,
      distanceMeters: 12300,
      plannedDurationSeconds: 1540,
      provider: "system"
    };

    const firstResponse = await requestJson(`${context.url}/navigation/trips`, context.token, {
      body: JSON.stringify(tripPayload),
      method: "POST"
    });
    const duplicateResponse = await requestJson(`${context.url}/navigation/trips`, context.token, {
      body: JSON.stringify(tripPayload),
      method: "POST"
    });
    const historyResponse = await requestJson(
      `${context.url}/navigation/trips?vehicleId=vehicle-101&date=${serviceDate}&limit=12`,
      context.token
    );

    assert.equal(firstResponse.status, 201);
    assert.equal(duplicateResponse.status, 201);
    assert.equal(firstResponse.payload.data.lap, 3);
    assert.equal(duplicateResponse.payload.data.lap, 3);
    assert.equal(firstResponse.payload.data.id, duplicateResponse.payload.data.id);
    assert.equal(historyResponse.payload.data.logs.length, 3);
    assert.equal(
      historyResponse.payload.data.logs.filter(
        (entry) => entry.startedAt === tripPayload.startedAt && entry.finishedAt === tripPayload.finishedAt
      ).length,
      1
    );
    console.log("ok - POST /api/navigation/trips evita duplicados exactos y conserva el lap");
  } finally {
    await context.close();
  }
}

async function main() {
  await testListTripsByVehicleAndServiceDate();
  await testDeduplicateTripLogCreation();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
