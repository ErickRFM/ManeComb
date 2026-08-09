const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");

async function startServer() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "profile-authority-test" })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    store,
    url: `http://127.0.0.1:${address.port}/api`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    })
  };
}

async function requestJson(url, token, body) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    payload: await response.json()
  };
}

async function testDriverCannotEscalateSelfProfile() {
  const context = await startServer();

  try {
    const driver = await context.store.createUser({
      name: "Driver Original",
      email: `profile-driver-${Date.now()}@manecomb.test`,
      password: "Ruta123!",
      phone: "+52 55 0000 1000",
      role: "driver",
      accountType: "operations",
      organizationId: "org-profile-authority",
      companyId: "org-profile-authority",
      userStatus: "active",
      status: "offline",
      shift: "Matutino"
    });
    const token = signToken(driver);

    const response = await requestJson(`${context.url}/users/me`, token, {
      name: "Driver Visible",
      phone: "+52 55 1111 2222",
      avatarUrl: "data:image/jpeg;base64,dGVzdA==",
      companyProfile: { companyName: "Injected Company" },
      paymentProfile: { preferredMethod: "card" },
      operationalSchedule: { enabled: false },
      role: "admin",
      accountType: "company_owner",
      vehicleId: "vehicle-injected",
      shift: "Nocturno"
    });

    assert.equal(response.status, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.data.name, "Driver Visible");
    assert.equal(response.payload.data.phone, "+52 55 1111 2222");
    assert.equal(response.payload.data.role, "driver");
    assert.equal(response.payload.data.accountType, "operations");
    assert.equal(response.payload.data.vehicleId || null, null);
    assert.equal(response.payload.data.shift, "Matutino");
    assert.equal(response.payload.data.companyProfile?.companyName || null, null);
    assert.equal(response.payload.data.paymentProfile?.preferredMethod, "spei");
    assert.equal(response.payload.data.operationalSchedule || null, null);

    const stored = await context.store.getUserById(driver.id);
    assert.equal(stored.role, "driver");
    assert.equal(stored.accountType, "operations");
    assert.equal(stored.vehicleId || null, null);
    assert.equal(stored.shift, "Matutino");
    assert.equal(stored.paymentProfile?.preferredMethod, "spei");
  } finally {
    await context.close();
  }
}

async function testCompanyOwnerKeepsCompanySelfService() {
  const context = await startServer();

  try {
    const owner = await context.store.createUser({
      name: "Owner Original",
      email: `profile-owner-${Date.now()}@manecomb.test`,
      password: "Ruta123!",
      role: "owner",
      accountType: "company_owner",
      organizationId: "org-company-profile",
      companyId: "org-company-profile",
      userStatus: "active",
      status: "offline"
    });
    const token = signToken(owner);

    const response = await requestJson(`${context.url}/users/me`, token, {
      companyProfile: {
        companyName: "Empresa Actualizada",
        billingEmail: "billing@manecomb.test"
      },
      paymentProfile: { preferredMethod: "spei" },
      role: "driver",
      vehicleId: "vehicle-injected"
    });

    assert.equal(response.status, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.data.role, "owner");
    assert.equal(response.payload.data.vehicleId || null, null);
    assert.equal(response.payload.data.companyProfile.companyName, "Empresa Actualizada");
    assert.equal(response.payload.data.paymentProfile.preferredMethod, "spei");
  } finally {
    await context.close();
  }
}

async function main() {
  await testDriverCannotEscalateSelfProfile();
  await testCompanyOwnerKeepsCompanySelfService();
  console.log("ok - profile authority API");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
