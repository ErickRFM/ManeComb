const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { resolveAccountChannel } = require("../src/services/account-channel");
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
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function requestJson(url, token, body, method = "PATCH") {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
}

async function testDriverCannotEscalateSelfProfile() {
  const context = await startServer();
  try {
    const driver = await context.store.createUser({
      name: "Driver Original", email: `profile-driver-${Date.now()}@manecomb.test`, password: "Ruta123!",
      phone: "+52 55 0000 1000", role: "driver", accountType: "operations",
      organizationId: "org-profile-authority", companyId: "org-profile-authority",
      userStatus: "active", status: "offline", shift: "Matutino"
    });
    const token = signToken(driver);
    const response = await requestJson(`${context.url}/users/me`, token, {
      name: "Driver Visible", phone: "+52 55 1111 2222", avatarUrl: "data:image/jpeg;base64,dGVzdA==",
      companyProfile: { companyName: "Injected Company" }, paymentProfile: { preferredMethod: "card" },
      operationalSchedule: { enabled: false }, role: "admin", accountType: "company_owner",
      vehicleId: "vehicle-injected", shift: "Nocturno"
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
  } finally { await context.close(); }
}

async function testAdminCannotOverwriteDriverSelfProfile() {
  const context = await startServer();
  try {
    const organizationId = `org-driver-admin-authority-${Date.now()}`;
    const owner = await context.store.createUser({
      name: "Owner", email: `profile-owner-${Date.now()}@manecomb.test`, password: "Ruta123!",
      role: "owner", accountType: "company_owner", organizationId, companyId: organizationId,
      userStatus: "active", status: "offline"
    });
    const driver = await context.store.createUser({
      name: "Driver Canonical", email: `profile-managed-driver-${Date.now()}@manecomb.test`, password: "Ruta123!",
      phone: "+52 55 2222 3333", role: "driver", accountType: "operations", organizationId,
      companyId: organizationId, userStatus: "active", status: "offline", shift: "Matutino"
    });
    const token = signToken(owner);
    const rejected = await requestJson(`${context.url}/users/${driver.id}`, token, {
      name: "Admin Override", email: "override@manecomb.test", phone: "+52 55 9999 9999",
      password: "Otro123!", avatarUrl: "data:image/jpeg;base64,dGVzdA=="
    });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.payload.code, "DRIVER_SELF_PROFILE_AUTHORITY");
    assert.ok(rejected.payload.fields.includes("name"));
    assert.ok(rejected.payload.fields.includes("password"));
    const unchanged = await context.store.getUserById(driver.id);
    assert.equal(unchanged.name, "Driver Canonical");
    assert.equal(unchanged.email, driver.email);
    assert.equal(unchanged.phone, "+52 55 2222 3333");

    const operational = await requestJson(`${context.url}/users/${driver.id}`, token, {
      shift: "Vespertino",
      operationalSchedule: { enabled: true, startTime: "13:00", endTime: "21:00", activeDays: [1, 2, 3, 4, 5], timezone: "America/Mexico_City" }
    });
    assert.equal(operational.status, 200);
    assert.equal(operational.payload.data.name, "Driver Canonical");
    assert.equal(operational.payload.data.shift, "Vespertino");
    assert.equal(operational.payload.data.operationalSchedule.startTime, "13:00");
    assert.equal(operational.payload.data.operationalSchedule.endTime, "21:00");
  } finally { await context.close(); }
}

async function testManagedUserCreationUsesCanonicalProfiles() {
  const context = await startServer();
  try {
    const organizationId = `org-managed-profile-${Date.now()}`;
    const owner = await context.store.createUser({
      name: "Owner Profiles", email: `managed-owner-${Date.now()}@manecomb.test`, password: "Ruta123!",
      role: "owner", accountType: "company_owner", organizationId, companyId: organizationId,
      userStatus: "active", status: "offline"
    });
    const token = signToken(owner);
    const create = (body) => requestJson(`${context.url}/users`, token, {
      name: `Staff ${body.role || "missing"}`,
      email: `staff-${body.role || "missing"}-${Math.random().toString(16).slice(2)}@manecomb.test`,
      password: "Ruta123!",
      ...body
    }, "POST");

    const missing = await create({});
    assert.equal(missing.status, 400);
    assert.equal(missing.payload.code, "INVALID_MANAGED_ROLE");

    const legacyDriverAlias = await create({ role: "conductor" });
    assert.equal(legacyDriverAlias.status, 409);
    assert.equal(legacyDriverAlias.payload.code, "DRIVER_ACTIVATION_REQUIRED");

    const driver = await create({ role: "driver" });
    assert.equal(driver.status, 409);
    assert.equal(driver.payload.code, "DRIVER_ACTIVATION_REQUIRED");

    const secondOwner = await create({ role: "owner" });
    assert.equal(secondOwner.status, 409);
    assert.equal(secondOwner.payload.code, "OWNER_REGISTRATION_REQUIRED");

    const supervisor = await create({ role: "supervisor", accountType: "company_owner" });
    assert.equal(supervisor.status, 201);
    assert.equal(supervisor.payload.data.role, "supervisor");
    assert.equal(supervisor.payload.data.accountType, "operations");
    assert.equal(resolveAccountChannel(supervisor.payload.data).channel, "mobile_operations");

    const billing = await create({ role: "billing_manager", accountType: "operations" });
    assert.equal(billing.status, 201);
    assert.equal(billing.payload.data.role, "billing_manager");
    assert.equal(billing.payload.data.accountType, "company_owner");
    assert.equal(resolveAccountChannel(billing.payload.data).channel, "company_portal");

    const admin = await create({ role: "admin" });
    assert.equal(admin.status, 201);
    assert.equal(admin.payload.data.role, "admin");
    assert.equal(admin.payload.data.accountType, "company_owner");
    assert.equal(resolveAccountChannel(admin.payload.data).channel, "company_portal");

    const createdDrivers = (await context.store.listUsers(owner)).filter((entry) => entry.role === "driver");
    assert.equal(createdDrivers.length, 0, "el CRUD administrativo nunca debe fabricar drivers");
  } finally { await context.close(); }
}

async function testCompanyAdministratorsKeepCompanySelfService() {
  for (const role of ["owner", "admin"]) {
    const context = await startServer();
    try {
      const user = await context.store.createUser({
        name: `${role} Original`, email: `profile-${role}-${Date.now()}@manecomb.test`, password: "Ruta123!",
        role, accountType: "company_owner", organizationId: `org-company-profile-${role}`,
        companyId: `org-company-profile-${role}`, userStatus: "active", status: "offline"
      });
      const token = signToken(user);
      const response = await requestJson(`${context.url}/users/me`, token, {
        companyProfile: { companyName: `Empresa ${role}`, billingEmail: `${role}@manecomb.test` },
        paymentProfile: { preferredMethod: "spei" }, role: "driver", vehicleId: "vehicle-injected"
      });
      assert.equal(response.status, 200);
      assert.equal(response.payload.data.role, role);
      assert.equal(response.payload.data.vehicleId || null, null);
      assert.equal(response.payload.data.companyProfile.companyName, `Empresa ${role}`);
      assert.equal(response.payload.data.paymentProfile.preferredMethod, "spei");
    } finally { await context.close(); }
  }
}

async function testLimitedPortalRolesCannotEditCompanyProfile() {
  for (const role of ["billing_manager", "support", "viewer"]) {
    const context = await startServer();
    try {
      const user = await context.store.createUser({
        name: `${role} Original`, email: `profile-limited-${role}-${Date.now()}@manecomb.test`, password: "Ruta123!",
        role, accountType: "company_owner", organizationId: `org-limited-profile-${role}`,
        companyId: `org-limited-profile-${role}`, userStatus: "active", status: "offline",
        companyProfile: { companyName: "Empresa Canónica" }
      });
      const token = signToken(user);
      const response = await requestJson(`${context.url}/users/me`, token, {
        name: `${role} Personal Updated`, phone: "+52 55 4444 5555", companyName: "Injected direct company",
        billingEmail: "injected@manecomb.test", companyProfile: { companyName: "Injected Company" },
        paymentProfile: { preferredMethod: "card" }, operationalSchedule: { enabled: false }
      });
      assert.equal(response.status, 200);
      assert.equal(response.payload.data.name, `${role} Personal Updated`);
      assert.equal(response.payload.data.phone, "+52 55 4444 5555");
      assert.equal(response.payload.data.companyProfile.companyName, "Empresa Canónica");
      assert.equal(response.payload.data.paymentProfile.preferredMethod, "spei");
      assert.equal(response.payload.data.operationalSchedule || null, null);
      const stored = await context.store.getUserById(user.id);
      assert.equal(stored.companyProfile.companyName, "Empresa Canónica");
      assert.equal(stored.paymentProfile.preferredMethod, "spei");
    } finally { await context.close(); }
  }
}

async function main() {
  await testDriverCannotEscalateSelfProfile();
  await testAdminCannotOverwriteDriverSelfProfile();
  await testManagedUserCreationUsesCanonicalProfiles();
  await testCompanyAdministratorsKeepCompanySelfService();
  await testLimitedPortalRolesCannotEditCompanyProfile();
  console.log("ok - profile authority API");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
