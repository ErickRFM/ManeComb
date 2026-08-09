const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
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
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "document-upload-authority-test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api`,
    dispatcherToken: signToken(dispatcher),
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

async function main() {
  const context = await createContext();
  try {
    const response = await fetch(`${context.baseUrl}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${context.dispatcherToken}` },
      body: buildUploadForm()
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.ok, false);
    assert.match(payload.message, /permiso/i);
    console.log("ok - document upload authority");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
