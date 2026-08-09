const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { sanitizeProfileForViewer } = require("../src/services/profile-visibility");
const { signToken } = require("../src/utils/jwt");

async function createContext() {
  const store = createEmbeddedStore();
  const dispatcher = await store.createUser({
    name: "Dispatcher Documents Guard",
    email: `dispatcher-docs-${Date.now()}@manecomb.test`,
    password: "Ruta123!",
    role: "dispatcher",
    accountType: "operations",
    organizationId: "manecomb-demo",
    companyId: "manecomb-demo",
    userStatus: "active",
    status: "offline"
  });
  const supervisor = await store.createUser({
    name: "Supervisor Documents Guard",
    email: `supervisor-docs-${Date.now()}@manecomb.test`,
    password: "Ruta123!",
    role: "supervisor",
    accountType: "operations",
    organizationId: "manecomb-demo",
    companyId: "manecomb-demo",
    userStatus: "active",
    status: "offline"
  });
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "document-authority-test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api`,
    dispatcher,
    dispatcherToken: signToken(dispatcher),
    supervisor,
    supervisorToken: signToken(supervisor),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

function buildUploadForm() {
  const form = new FormData();
  form.append("name", "Licencia tipo C");
  form.append("category", "license");
  form.append("expiresAt", "2027-12-31T00:00:00.000Z");
  form.append("ownerType", "driver");
  form.append("ownerId", "user-driver-01");
  form.append("file", new Blob(["dispatcher-must-not-upload"], { type: "image/png" }), "licencia.png");
  return form;
}

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  return {
    response,
    payload: await response.json()
  };
}

function testProfileVisibilityPolicy(context) {
  const sampleProfile = {
    user: context.dispatcher,
    documents: [{ id: "doc-private" }],
    vehicles: []
  };
  const dispatcherProfile = sanitizeProfileForViewer(context.dispatcher, sampleProfile);
  const supervisorProfile = sanitizeProfileForViewer(context.supervisor, sampleProfile);
  const driverProfile = sanitizeProfileForViewer(
    { ...context.dispatcher, role: "driver", accountType: "operations" },
    sampleProfile
  );

  assert.deepEqual(dispatcherProfile.documents, []);
  assert.equal(supervisorProfile.documents.length, 1);
  assert.equal(driverProfile.documents.length, 1);
}

async function testDispatcherCannotReadDocumentCollection(context) {
  const { response, payload } = await requestJson(
    `${context.baseUrl}/documents`,
    context.dispatcherToken
  );
  assert.equal(response.status, 403);
  assert.equal(payload.ok, false);
  assert.match(payload.message, /permiso/i);
}

async function testDocumentManagerCanReadDocumentCollection(context) {
  const { response, payload } = await requestJson(
    `${context.baseUrl}/documents`,
    context.supervisorToken
  );
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.data));
}

async function testDispatcherProfileResponsesRedactDocuments(context) {
  const authResponse = await requestJson(
    `${context.baseUrl}/auth/me`,
    context.dispatcherToken
  );
  assert.equal(authResponse.response.status, 200);
  assert.equal(authResponse.payload.ok, true);
  assert.deepEqual(authResponse.payload.profile.documents, []);

  const userResponse = await requestJson(
    `${context.baseUrl}/users/me`,
    context.dispatcherToken
  );
  assert.equal(userResponse.response.status, 200);
  assert.equal(userResponse.payload.ok, true);
  assert.deepEqual(userResponse.payload.data.documents, []);
}

async function testDispatcherCannotUploadDocument(context) {
  const { response, payload } = await requestJson(
    `${context.baseUrl}/documents`,
    context.dispatcherToken,
    {
      method: "POST",
      body: buildUploadForm()
    }
  );

  assert.equal(response.status, 403);
  assert.equal(payload.ok, false);
  assert.match(payload.message, /permiso/i);
}

async function main() {
  const context = await createContext();
  try {
    testProfileVisibilityPolicy(context);
    await testDispatcherCannotReadDocumentCollection(context);
    await testDocumentManagerCanReadDocumentCollection(context);
    await testDispatcherProfileResponsesRedactDocuments(context);
    await testDispatcherCannotUploadDocument(context);
    console.log("ok - document read/write/profile authority");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
