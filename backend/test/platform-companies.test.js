process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signPlatformToken } = require("../src/utils/platform-jwt");
const { createPlatformSession, markPlatformSessionMfaVerified } = require("../src/services/platform-sessions");
const {
  listPlatformCompanies,
  getPlatformCompany,
  normalizeOrganizationId
} = require("../src/modules/platform/company-service");

function requestJson(server, { path, token }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const request = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path,
      method: "GET",
      headers: token ? { authorization: `Bearer ${token}` } : {}
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, body: body ? JSON.parse(body) : null });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function main() {
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total += 1;
    try {
      await fn();
      passed += 1;
      console.log("PASS:", name);
    } catch (error) {
      console.error("FAIL:", name, "-", error.message);
      process.exit(1);
    }
  }

  const stubUsers = [
    {
      id: "owner-alpha",
      organizationId: "org-alpha",
      name: "Alpha Owner",
      email: "owner@alpha.test",
      role: "owner",
      accountType: "company_owner",
      userStatus: "active",
      lastAccessAt: "2026-08-05T10:00:00.000Z",
      companyProfile: { companyName: "Transportes Alpha" }
    },
    {
      id: "driver-alpha",
      organizationId: "org-alpha",
      name: "Alpha Driver",
      email: "driver@alpha.test",
      role: "driver",
      accountType: "operations",
      userStatus: "pending",
      lastAccessAt: "2026-08-04T10:00:00.000Z"
    },
    {
      id: "owner-beta",
      organizationId: "org-beta",
      name: "Beta Owner",
      email: "owner@beta.test",
      role: "owner",
      accountType: "company_owner",
      userStatus: "suspended",
      lastAccessAt: "2026-08-01T10:00:00.000Z"
    }
  ];
  const stubOrders = [
    {
      id: "order-alpha",
      organizationId: "org-alpha",
      ownerUserId: "owner-alpha",
      companyName: "Transportes Alpha",
      planId: "value-4",
      planName: "4 combis",
      paymentStatus: "paid",
      // Estado canonico que buildCommercialActivationUpdate persiste al activar
      // una orden sin onboarding guiado.
      onboardingStatus: "self_service_ready",
      activationStatus: "active",
      totalPrice: 209,
      paymentMethod: "card",
      paymentProvider: "mercado_pago",
      createdAt: "2026-08-03T10:00:00.000Z",
      paymentProviderReference: "must-not-leak"
    },
    {
      id: "order-beta",
      organizationId: "org-beta",
      ownerUserId: "owner-beta",
      companyName: "Movilidad Beta",
      planId: "starter-2",
      paymentStatus: "pending",
      onboardingStatus: "pending",
      activationStatus: "pending_payment",
      totalPrice: 149,
      createdAt: "2026-08-02T10:00:00.000Z"
    }
  ];
  const stubVehicles = {
    "org-alpha": [
      { id: "va-1", code: "A-1", plate: "AAA-111", status: "on-route", updatedAt: "2026-08-05T11:00:00.000Z", location: { latitude: 1, longitude: 2 } },
      { id: "va-2", code: "A-2", plate: "AAA-222", status: "maintenance", updatedAt: "2026-08-05T09:00:00.000Z" }
    ],
    "org-beta": [
      { id: "vb-1", code: "B-1", plate: "BBB-111", status: "idle", retiredAt: "2026-07-01T00:00:00.000Z" }
    ]
  };
  const stubStore = {
    listUsers: () => stubUsers,
    listCommercialOrders: () => stubOrders,
    listVehiclesForOrganization: (organizationId) => stubVehicles[organizationId] || []
  };

  await test("listado paginado y ordenado", async () => {
    const result = await listPlatformCompanies(stubStore, {
      page: "1",
      limit: "1",
      sort: "companyName",
      order: "asc"
    });
    assert.equal(result.pagination.total, 2);
    assert.equal(result.pagination.totalPages, 2);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].organizationId, "org-beta");
  });

  await test("búsqueda y filtros usan allowlists", async () => {
    const result = await listPlatformCompanies(stubStore, {
      search: "alpha",
      planId: "value-4",
      paymentStatus: "paid",
      onboardingStatus: "self_service_ready"
    });
    assert.equal(result.pagination.total, 1);
    assert.equal(result.items[0].companyName, "Transportes Alpha");
    assert.equal(result.items[0].plan.id, "value-4");
  });

  // El filtro compara literalmente contra lo que el writer persistio. Antes
  // aceptaba un vocabulario propio (in_progress/ready/completed/blocked) que
  // buildCommercialActivationUpdate nunca escribe, de modo que filtrar por
  // onboarding no podia devolver ninguna empresa ya activada.
  const onboardingStore = {
    listUsers: () => [
      { id: "owner-kickoff", organizationId: "org-kickoff", name: "Kickoff Owner", email: "owner@kickoff.test", role: "owner", accountType: "company_owner", userStatus: "active", companyProfile: { companyName: "Guiada" } },
      { id: "owner-self", organizationId: "org-self", name: "Self Owner", email: "owner@self.test", role: "owner", accountType: "company_owner", userStatus: "active", companyProfile: { companyName: "Autoservicio" } },
      { id: "owner-new", organizationId: "org-new", name: "New Owner", email: "owner@new.test", role: "owner", accountType: "company_owner", userStatus: "active", companyProfile: { companyName: "Sin activar" } }
    ],
    listCommercialOrders: () => [
      { id: "order-kickoff", organizationId: "org-kickoff", ownerUserId: "owner-kickoff", companyName: "Guiada", planId: "value-4", paymentStatus: "paid", activationStatus: "active", onboardingStatus: "kickoff_pending", createdAt: "2026-08-03T10:00:00.000Z" },
      { id: "order-self", organizationId: "org-self", ownerUserId: "owner-self", companyName: "Autoservicio", planId: "starter-2", paymentStatus: "paid", activationStatus: "active", onboardingStatus: "self_service_ready", createdAt: "2026-08-03T11:00:00.000Z" },
      { id: "order-new", organizationId: "org-new", ownerUserId: "owner-new", companyName: "Sin activar", planId: "starter-2", paymentStatus: "pending", activationStatus: "pending_payment", onboardingStatus: "pending", createdAt: "2026-08-03T12:00:00.000Z" }
    ],
    listVehiclesForOrganization: () => []
  };

  await test("filtrar por kickoff_pending devuelve la empresa con onboarding guiado", async () => {
    const result = await listPlatformCompanies(onboardingStore, { onboardingStatus: "kickoff_pending" });
    assert.equal(result.pagination.total, 1);
    assert.equal(result.items[0].organizationId, "org-kickoff");
    assert.equal(result.items[0].commercial.onboardingStatus, "kickoff_pending");
  });

  await test("filtrar por self_service_ready devuelve la empresa autoservicio", async () => {
    const result = await listPlatformCompanies(onboardingStore, { onboardingStatus: "self_service_ready" });
    assert.equal(result.pagination.total, 1);
    assert.equal(result.items[0].organizationId, "org-self");
    assert.equal(result.items[0].commercial.onboardingStatus, "self_service_ready");
  });

  await test("filtrar por pending devuelve la orden aun no activada", async () => {
    const result = await listPlatformCompanies(onboardingStore, { onboardingStatus: "pending" });
    assert.equal(result.pagination.total, 1);
    assert.equal(result.items[0].organizationId, "org-new");
  });

  await test("un estado fuera del vocabulario del writer se sanea y no filtra", async () => {
    // sanitizeEnum devuelve null para valores no permitidos y el filtro se omite:
    // se conserva el comportamiento existente, sin compatibilidad inventada.
    const result = await listPlatformCompanies(onboardingStore, { onboardingStatus: "completed" });
    assert.equal(result.pagination.total, 3);
    assert.equal(result.filters.onboardingStatus, null);
  });

  await test("DTO de empresa no expone secretos comerciales ni GPS", async () => {
    const company = await getPlatformCompany(stubStore, "org-alpha");
    const serialized = JSON.stringify(company);
    assert.equal(company.users.total, 2);
    assert.equal(company.vehicles.byStatus.on_route, 1);
    assert.equal(company.vehicles.byStatus.maintenance, 1);
    assert.equal(company.commercial.paymentStatus, "paid");
    assert.equal(serialized.includes("paymentProviderReference"), false);
    assert.equal(serialized.includes("latitude"), false);
    assert.equal(serialized.includes("longitude"), false);
    assert.equal(serialized.includes("passwordHash"), false);
  });

  await test("ID inválido y empresa inexistente responden como no encontradas", async () => {
    assert.equal(normalizeOrganizationId("$where"), null);
    await assert.rejects(() => getPlatformCompany(stubStore, "$where"), /Empresa no encontrada/);
    await assert.rejects(() => getPlatformCompany(stubStore, "org-missing"), /Empresa no encontrada/);
  });

  const store = createEmbeddedStore();
  const platformUser = store.createPlatformUser({
    name: "Companies Admin",
    email: "companies-admin@manecomb.com",
    password: "PlatformTest@123",
    role: "platform_admin"
  });
  const { session } = await createPlatformSession(platformUser.id, {
    app: { locals: { store } },
    headers: { "user-agent": "platform-companies-test" },
    ip: "127.0.0.1"
  });
  await markPlatformSessionMfaVerified(session.id);
  const token = signPlatformToken({ _id: platformUser.id, role: platformUser.role }, session.id);

  store.createUser({
    name: "Empresa Integración",
    email: "owner@integration.test",
    password: "EnterpriseTest@123",
    role: "owner",
    accountType: "company_owner",
    organizationId: "org-integration",
    userStatus: "active",
    companyProfile: { companyName: "Empresa Integración" }
  });
  store.createVehicle({
    plate: "INT-001",
    code: "INT-1",
    capacity: 14,
    status: "on-route",
    organizationId: "org-integration"
  });
  store.createCommercialOrder({
    planId: "starter-2",
    ownerAccountEmail: "owner@integration.test",
    companyName: "Empresa Integración",
    organizationId: "org-integration"
  });

  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await test("GET /api/platform/companies exige token Platform", async () => {
      const response = await requestJson(server, { path: "/api/platform/companies" });
      assert.equal(response.status, 401);
    });

    await test("token empresarial no puede consultar empresas globales", async () => {
      const enterpriseToken = jwt.sign(
        { tokenType: "enterprise", sub: "enterprise-user", sid: "enterprise-session" },
        process.env.JWT_SECRET,
        { audience: "manecomb-api", issuer: "manecomb-api", expiresIn: "5m" }
      );
      const response = await requestJson(server, {
        path: "/api/platform/companies",
        token: enterpriseToken
      });
      assert.equal(response.status, 401);
    });

    await test("GET /api/platform/companies devuelve paginación y filtros", async () => {
      const response = await requestJson(server, {
        path: "/api/platform/companies?search=integraci%C3%B3n&limit=10",
        token
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.ok, true);
      assert.ok(Array.isArray(response.body.data));
      assert.equal(response.body.pagination.limit, 10);
      assert.ok(response.body.data.some((company) => company.organizationId === "org-integration"));
    });

    await test("GET /api/platform/companies/:id devuelve detalle sanitizado", async () => {
      const response = await requestJson(server, {
        path: "/api/platform/companies/org-integration",
        token
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.organizationId, "org-integration");
      assert.ok(Array.isArray(response.body.data.users.items));
      assert.ok(Array.isArray(response.body.data.vehicles.items));
      assert.equal(JSON.stringify(response.body).includes("location"), false);
    });

    await test("GET /api/platform/companies/:id responde 404 sin filtrar errores internos", async () => {
      const response = await requestJson(server, {
        path: "/api/platform/companies/org-missing",
        token
      });
      assert.equal(response.status, 404);
      assert.equal(response.body.ok, false);
      assert.equal(response.body.message, "Empresa no encontrada");
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\nAll ${passed}/${total} platform-companies tests passed`);
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
