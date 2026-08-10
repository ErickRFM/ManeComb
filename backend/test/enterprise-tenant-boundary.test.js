const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");

async function requestJson(baseUrl, route, token) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  return { response, payload: await response.json() };
}

function assertNoEnterpriseGlobalAdminBypass() {
  const dataRoot = path.join(__dirname, "../src/data");
  for (const fileName of ["store.js", "mongo-store.js"]) {
    const source = fs.readFileSync(path.join(dataRoot, fileName), "utf8");
    assert.equal(
      source.includes("canAccessAllOrganizations"),
      false,
      `${fileName} must not grant cross-organization access to an enterprise admin role`
    );
  }
}

async function createContext() {
  const store = createEmbeddedStore();
  const legacyAdmin = await Promise.resolve(store.findUserByEmail("admin@combis.app"));
  assert.ok(legacyAdmin, "seed operational admin must exist");
  assert.equal(legacyAdmin.role, "admin");
  assert.equal(legacyAdmin.accountType, "operations");
  assert.equal(legacyAdmin.organizationId, "manecomb-demo");

  const stamp = Date.now();
  const foreignOrganizationId = `tenant-foreign-${stamp}`;
  const foreignDriver = await Promise.resolve(store.createUser({
    name: "Foreign Document Driver",
    email: `foreign-doc-driver-${stamp}@manecomb.test`,
    password: "Ruta123!",
    role: "driver",
    accountType: "operations",
    organizationId: foreignOrganizationId,
    companyId: foreignOrganizationId,
    userStatus: "active",
    status: "offline"
  }));

  const foreignDocument = await Promise.resolve(store.createDocument({
    ownerType: "driver",
    ownerId: foreignDriver.id,
    name: "Documento privado de otro tenant",
    category: "license",
    expiresAt: "2027-12-31T00:00:00.000Z",
    organizationId: foreignOrganizationId,
    uploadedBy: foreignDriver.id,
    storageKey: `documents/${foreignOrganizationId}/private.pdf`,
    originalFileName: "private.pdf",
    mimeType: "application/pdf",
    fileSize: 32
  }));

  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "enterprise-tenant-boundary-test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    store,
    legacyAdmin,
    foreignDocument,
    foreignOrganizationId,
    token: signToken(legacyAdmin),
    baseUrl: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

async function main() {
  assertNoEnterpriseGlobalAdminBypass();

  const context = await createContext();
  try {
    const directDocuments = await Promise.resolve(
      context.store.getDocumentsForUser(context.legacyAdmin)
    );
    assert.equal(
      directDocuments.some((document) => document.id === context.foreignDocument.id),
      false,
      "enterprise store must scope legacy admin document reads to its organization"
    );
    assert.equal(
      directDocuments.some((document) => document.organizationId === context.foreignOrganizationId),
      false
    );

    const documents = await requestJson(context.baseUrl, "/documents", context.token);
    assert.equal(documents.response.status, 200);
    assert.equal(documents.payload.ok, true);
    assert.equal(
      documents.payload.data.some((document) => document.id === context.foreignDocument.id),
      false,
      "GET /documents must never return another tenant to an enterprise admin"
    );
    assert.equal(
      documents.payload.data.every(
        (document) => String(document.organizationId || "") === context.legacyAdmin.organizationId
      ),
      true
    );

    const users = await requestJson(context.baseUrl, "/users", context.token);
    assert.equal(users.response.status, 200);
    assert.equal(users.payload.ok, true);
    assert.equal(
      users.payload.data.some((user) => user.organizationId === context.foreignOrganizationId),
      false,
      "legacy admin user inventory must also remain tenant-scoped"
    );

    console.log("ok - enterprise admin remains inside its tenant; global inventory belongs only to Platform/internal callers");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
