const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
process.env.PLATFORM_JWT_SECRET = "platform-test-jwt-secret-with-at-least-32-characters";
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");
const {
  canAccessDocument,
  resolveUploadOwner
} = require("../src/modules/documents/routes");

async function createContext() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    ),
    store,
    tokens: {
      admin: signToken(store.getUserById("user-admin-01")),
      driver1: signToken(store.getUserById("user-driver-01")),
      driver2: signToken(store.getUserById("user-driver-02"))
    }
  };
}

async function requestJson(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
  return {
    payload: await response.json(),
    status: response.status
  };
}

function buildUploadForm(overrides = {}) {
  const form = new FormData();
  form.append("name", overrides.name || "Licencia tipo C");
  form.append("category", overrides.category || "license");
  form.append("expiresAt", overrides.expiresAt || "2027-12-31T00:00:00.000Z");
  form.append("ownerType", overrides.ownerType || "driver");
  form.append("ownerId", overrides.ownerId || "user-driver-01");
  form.append(
    "file",
    new Blob([overrides.contents || "document-image"], { type: overrides.mimeType || "image/png" }),
    overrides.fileName || "licencia.png"
  );
  return form;
}

function removeUploadedAsset(document) {
  if (document?.storageType !== "local" || !document.storageKey) return;
  const filePath = path.resolve(__dirname, "../uploads/documents", document.storageKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

async function run() {
  const context = await createContext();
  const uploaded = [];

  try {
    const driver2 = context.store.getUserById("user-driver-02");
    assert.deepEqual(
      resolveUploadOwner(driver2, { ownerType: "driver", ownerId: "user-driver-01" }),
      { ownerType: "driver", ownerId: "user-driver-02" }
    );
    assert.equal(
      canAccessDocument(driver2, {
        organizationId: "foreign-tenant",
        ownerType: "driver",
        ownerId: driver2.id
      }),
      false
    );

    const created = await requestJson(
      `${context.baseUrl}/documents`,
      context.tokens.driver2,
      { method: "POST", body: buildUploadForm({ ownerId: "user-driver-01" }) }
    );
    assert.equal(created.status, 201);
    assert.equal(created.payload.data.ownerType, "driver");
    assert.equal(created.payload.data.ownerId, "user-driver-02");
    assert.equal(created.payload.data.organizationId, "manecomb-demo");
    assert.equal(created.payload.data.reviewStatus, "pending_review");
    uploaded.push(created.payload.data);

    const ownDocuments = await requestJson(
      `${context.baseUrl}/documents`,
      context.tokens.driver2
    );
    assert.equal(ownDocuments.status, 200);
    assert.ok(ownDocuments.payload.data.some((entry) => entry.id === created.payload.data.id));
    assert.ok(ownDocuments.payload.data.every((entry) =>
      entry.ownerId === "user-driver-02" || entry.ownerId === driver2.vehicleId
    ));

    const otherDriverDocuments = await requestJson(
      `${context.baseUrl}/documents`,
      context.tokens.driver1
    );
    assert.ok(!otherDriverDocuments.payload.data.some((entry) => entry.id === created.payload.data.id));

    const forbiddenReview = await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}/review`,
      context.tokens.driver2,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: "approved" })
      }
    );
    assert.equal(forbiddenReview.status, 403);

    const rejected = await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}/review`,
      context.tokens.admin,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: "rejected",
          reviewNotes: "Imagen poco legible"
        })
      }
    );
    assert.equal(rejected.status, 200);
    assert.equal(rejected.payload.data.reviewNotes, "Imagen poco legible");

    const replacement = await requestJson(
      `${context.baseUrl}/documents`,
      context.tokens.driver2,
      { method: "POST", body: buildUploadForm({ ownerId: "user-driver-01", fileName: "licencia-nueva.png" }) }
    );
    assert.equal(replacement.status, 201);
    uploaded.push(replacement.payload.data);

    const adminDocuments = await requestJson(
      `${context.baseUrl}/documents/admin`,
      context.tokens.admin
    );
    assert.equal(adminDocuments.status, 200);
    assert.ok(adminDocuments.payload.data.some((entry) => entry.id === created.payload.data.id));
    assert.ok(adminDocuments.payload.data.some((entry) => entry.id === replacement.payload.data.id));

    const invalidUpload = await requestJson(
      `${context.baseUrl}/documents`,
      context.tokens.driver2,
      {
        method: "POST",
        body: buildUploadForm({ mimeType: "text/plain", fileName: "invalid.txt" })
      }
    );
    assert.equal(invalidUpload.status, 415);
    assert.match(invalidUpload.payload.message, /PDF, JPG, PNG o WEBP/);
    const afterFailure = await context.store.getDocumentsForUser(driver2);
    assert.ok(afterFailure.some((entry) => entry.id === created.payload.data.id));
    assert.ok(afterFailure.some((entry) => entry.id === replacement.payload.data.id));

    console.log("ok - conductor gestiona solo sus documentos y admin conserva revision");
  } finally {
    uploaded.forEach(removeUploadedAsset);
    await context.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
