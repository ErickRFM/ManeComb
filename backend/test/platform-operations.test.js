process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const assert = require("node:assert/strict");
const http = require("http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signPlatformToken } = require("../src/utils/platform-jwt");
const { createPlatformSession, markPlatformSessionMfaVerified } = require("../src/services/platform-sessions");
const {
  serializeCommercialOrder,
  listPlatformCommercialOrders,
  getPlatformSystemReadiness,
  sanitizeAuditMetadata,
  serializeAuditEntry
} = require("../src/modules/platform/operations-service");

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

  const rawOrder = {
    id: "order-safe",
    organizationId: "org-safe",
    companyName: "Empresa Segura",
    ownerUserId: "owner-safe",
    ownerAccountName: "Owner Safe",
    ownerAccountEmail: "owner@safe.test",
    planId: "value-4",
    basePlanPrice: 159,
    totalPrice: 179,
    paymentStatus: "paid",
    activationStatus: "active",
    onboardingStatus: "self_service_ready",
    paymentMethod: "card",
    paymentProvider: "mercado_pago",
    paymentProviderReference: "secret-provider-reference",
    paymentMetadata: { accessToken: "must-not-leak" },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };

  await test("commercial DTO excludes provider references and raw metadata", async () => {
    const serialized = serializeCommercialOrder(rawOrder);
    const text = JSON.stringify(serialized);
    assert.equal(serialized.companyName, "Empresa Segura");
    assert.equal(serialized.plan.id, "value-4");
    assert.equal(text.includes("secret-provider-reference"), false);
    assert.equal(text.includes("accessToken"), false);
    assert.equal(text.includes("paymentMetadata"), false);
  });

  await test("commercial list paginates and filters", async () => {
    const result = await listPlatformCommercialOrders({
      listCommercialOrders: () => [rawOrder, { ...rawOrder, id: "order-2", companyName: "Otra", paymentStatus: "pending" }]
    }, { paymentStatus: "paid", page: "1", limit: "10" });
    assert.equal(result.pagination.total, 1);
    assert.equal(result.items[0].id, "order-safe");
  });

  await test("system readiness is explicit and secret-free", async () => {
    const readiness = getPlatformSystemReadiness({ connected: false, mode: "embedded", message: "test" });
    const text = JSON.stringify(readiness);
    assert.ok(readiness.generatedAt);
    assert.ok(readiness.database);
    assert.equal(text.includes("accessToken"), false);
    assert.equal(text.includes("apiKey"), false);
    assert.equal(text.includes("webhookSecret"), false);
  });

  await test("audit metadata allowlist removes arbitrary payloads", async () => {
    const safe = sanitizeAuditMetadata({
      actorType: "platform",
      platformRole: "platform_admin",
      result: "success",
      filters: { search: "alpha", accessToken: "secret" },
      accessToken: "secret",
      rawPayload: { password: "secret" }
    });
    const text = JSON.stringify(safe);
    assert.equal(safe.actorType, "platform");
    assert.equal(text.includes("accessToken"), false);
    assert.equal(text.includes("rawPayload"), false);
  });

  await test("audit serializer hides IP and user agent", async () => {
    const entry = serializeAuditEntry({
      _id: "audit-1",
      actorId: "platform-1",
      action: "platform.company.view",
      ip: "127.0.0.1",
      userAgent: "private-agent",
      metadata: { actorType: "platform", result: "success", platformRole: "platform_admin" },
      createdAt: new Date()
    });
    const text = JSON.stringify(entry);
    assert.equal(text.includes("127.0.0.1"), false);
    assert.equal(text.includes("private-agent"), false);
  });

  const store = createEmbeddedStore();
  const platformUser = store.createPlatformUser({
    name: "Operations Admin",
    email: "operations-admin@manecomb.com",
    password: "PlatformTest@123",
    role: "platform_admin"
  });
  const requestContext = {
    app: { locals: { store } },
    headers: { "user-agent": "platform-operations-test" },
    ip: "127.0.0.1"
  };
  const { session } = await createPlatformSession(platformUser.id, requestContext);
  await markPlatformSessionMfaVerified(session.id);
  const token = signPlatformToken({ _id: platformUser.id, role: platformUser.role }, session.id);

  store.createCommercialOrder({
    planId: "starter-2",
    ownerAccountEmail: "owner@operations.test",
    companyName: "Empresa Operaciones",
    organizationId: "org-operations"
  });

  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await test("commercial orders route is protected", async () => {
      const response = await requestJson(server, { path: "/api/platform/commercial/orders" });
      assert.equal(response.status, 401);
    });

    await test("commercial orders route returns sanitized pagination", async () => {
      const response = await requestJson(server, { path: "/api/platform/commercial/orders?limit=10", token });
      assert.equal(response.status, 200);
      assert.equal(response.body.ok, true);
      assert.ok(Array.isArray(response.body.data));
      assert.equal(response.body.pagination.limit, 10);
      assert.equal(JSON.stringify(response.body).includes("paymentProviderReference"), false);
    });

    await test("system readiness route returns sanitized status", async () => {
      const response = await requestJson(server, { path: "/api/platform/system/readiness", token });
      assert.equal(response.status, 200);
      assert.ok(response.body.data.database);
      const text = JSON.stringify(response.body);
      assert.equal(text.includes("apiKey"), false);
      assert.equal(text.includes("accessToken"), false);
    });

    await test("audit route degrades safely without Mongo", async () => {
      const response = await requestJson(server, { path: "/api/platform/audit?limit=20", token });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, []);
      assert.equal(response.body.persistent, false);
      assert.equal(response.body.pagination.total, 0);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\nAll ${passed}/${total} platform-operations tests passed`);
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
