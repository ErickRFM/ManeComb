const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
process.env.PLATFORM_JWT_SECRET = "platform-test-jwt-secret-with-at-least-32-characters";
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");
const { deleteDocumentAsset, getCloudinaryDownloadUrl } = require("../src/services/storage");
const {
  canAccessDocument,
  canDriverMutateDocument,
  resolveUploadOwner,
  sanitizeDownloadFileName
} = require("../src/modules/documents/routes");

const uploadsDirectory = path.resolve(__dirname, "../uploads/documents");

async function createContext() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const driver2 = store.getUserById("user-driver-02");
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    ),
    store,
    tokens: {
      admin: signToken(store.getUserById("user-admin-01")),
      driver1: signToken(store.getUserById("user-driver-01")),
      driver2: signToken(driver2)
    }
  };
}

async function request(url, token, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  });
}

async function requestJson(url, token, init = {}) {
  const response = await request(url, token, init);
  return { payload: await response.json(), status: response.status };
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

function jsonBody(payload) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}

function listLocalAssets() {
  return fs.existsSync(uploadsDirectory)
    ? fs.readdirSync(uploadsDirectory).sort()
    : [];
}

function removeUploadedAsset(document) {
  if (document?.storageType !== "local" || !document.storageKey) return;
  const filePath = path.resolve(uploadsDirectory, document.storageKey);
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
    assert.equal(canAccessDocument(driver2, {
      organizationId: "foreign-tenant",
      ownerType: "driver",
      ownerId: driver2.id
    }), false);
    assert.equal(canDriverMutateDocument({ reviewStatus: "approved", status: "vigente" }), false);
    assert.equal(canDriverMutateDocument({ reviewStatus: "rejected", status: "vigente" }), true);
    assert.equal(sanitizeDownloadFileName("mal\r\nname\".pdf"), "malname-.pdf");

    const created = await requestJson(`${context.baseUrl}/documents`, context.tokens.driver2, {
      method: "POST",
      body: buildUploadForm({ ownerId: "user-driver-01" })
    });
    assert.equal(created.status, 201);
    assert.equal(created.payload.data.ownerType, "driver");
    assert.equal(created.payload.data.ownerId, "user-driver-02");
    assert.equal(created.payload.data.organizationId, "manecomb-demo");
    assert.equal(created.payload.data.reviewStatus, "pending_review");
    assert.equal(created.payload.data.version, 1);
    uploaded.push(created.payload.data);

    const ownDocuments = await requestJson(`${context.baseUrl}/documents`, context.tokens.driver2);
    assert.equal(ownDocuments.status, 200);
    assert.ok(ownDocuments.payload.data.some((entry) => entry.id === created.payload.data.id));
    assert.ok(ownDocuments.payload.data.every((entry) =>
      entry.ownerId === "user-driver-02" || entry.ownerId === driver2.vehicleId
    ));
    const otherDriverDocuments = await requestJson(`${context.baseUrl}/documents`, context.tokens.driver1);
    assert.ok(!otherDriverDocuments.payload.data.some((entry) => entry.id === created.payload.data.id));

    const forbiddenReview = await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}/review`,
      context.tokens.driver2,
      { method: "PATCH", ...jsonBody({ reviewStatus: "approved" }) }
    );
    assert.equal(forbiddenReview.status, 403);
    const rejectionWithoutNotes = await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}/review`,
      context.tokens.admin,
      { method: "PATCH", ...jsonBody({ reviewStatus: "rejected" }) }
    );
    assert.equal(rejectionWithoutNotes.status, 400);
    const pendingReview = await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}/review`,
      context.tokens.admin,
      { method: "PATCH", ...jsonBody({ reviewStatus: "pending_review" }) }
    );
    assert.equal(pendingReview.status, 400);

    const rejected = await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}/review`,
      context.tokens.admin,
      { method: "PATCH", ...jsonBody({ reviewStatus: "rejected", reviewNotes: "Imagen poco legible" }) }
    );
    assert.equal(rejected.status, 200);
    assert.equal(rejected.payload.data.reviewNotes, "Imagen poco legible");
    const repeatedReview = await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}/review`,
      context.tokens.admin,
      { method: "PATCH", ...jsonBody({ reviewStatus: "rejected", reviewNotes: "Imagen poco legible" }) }
    );
    assert.equal(repeatedReview.status, 200);
    assert.equal(repeatedReview.payload.data.reviewVersion, rejected.payload.data.reviewVersion);

    assert.equal(
      context.store.updateDocument(created.payload.data.id, {
        organizationId: "foreign-tenant",
        expiresAt: "2028-01-01"
      }),
      null,
      "el store debe incluir tenant en la mutacion"
    );
    const forbiddenFieldsIgnored = await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}`,
      context.tokens.driver2,
      { method: "PATCH", ...jsonBody({ expiresAt: "2028-01-01", ownerId: "user-driver-01", organizationId: "foreign" }) }
    );
    assert.equal(forbiddenFieldsIgnored.status, 200);
    assert.equal(forbiddenFieldsIgnored.payload.data.ownerId, "user-driver-02");
    assert.equal(forbiddenFieldsIgnored.payload.data.organizationId, "manecomb-demo");
    assert.equal(forbiddenFieldsIgnored.payload.data.reviewStatus, "pending_review");
    assert.equal(forbiddenFieldsIgnored.payload.data.reviewNotes, "");

    await requestJson(
      `${context.baseUrl}/documents/${created.payload.data.id}/review`,
      context.tokens.admin,
      { method: "PATCH", ...jsonBody({ reviewStatus: "rejected", reviewNotes: "Reemplazar imagen" }) }
    );
    const replacementResults = await Promise.all([
      requestJson(`${context.baseUrl}/documents/${created.payload.data.id}/replace`, context.tokens.driver2, {
        method: "POST",
        body: buildUploadForm({ fileName: "licencia-a.png", expiresAt: "2029-01-01" })
      }),
      requestJson(`${context.baseUrl}/documents/${created.payload.data.id}/replace`, context.tokens.driver2, {
        method: "POST",
        body: buildUploadForm({ fileName: "licencia-b.png", expiresAt: "2029-01-01" })
      })
    ]);
    assert.deepEqual(replacementResults.map((entry) => entry.status).sort(), [201, 409]);
    const replacement = replacementResults.find((entry) => entry.status === 201).payload.data;
    uploaded.push(replacement);
    assert.equal(replacement.replacesDocumentId, created.payload.data.id);
    assert.equal(replacement.version, 2);
    assert.equal(replacement.reviewStatus, "pending_review");
    const history = await requestJson(
      `${context.baseUrl}/documents/${replacement.id}/history`,
      context.tokens.driver2
    );
    assert.equal(history.status, 200);
    assert.deepEqual(history.payload.data.map((entry) => entry.version), [1, 2]);
    assert.equal(history.payload.data[0].supersededByDocumentId, replacement.id);

    const beforeDeleteDownload = await request(
      `${context.baseUrl}/documents/files/${encodeURIComponent(replacement.storageKey)}`,
      context.tokens.driver2
    );
    assert.equal(beforeDeleteDownload.status, 200);
    const unauthenticatedDownload = await request(
      `${context.baseUrl}/documents/files/${encodeURIComponent(replacement.storageKey)}`,
      null
    );
    assert.equal(unauthenticatedDownload.status, 401);
    const deletedReplacement = await requestJson(
      `${context.baseUrl}/documents/${replacement.id}`,
      context.tokens.driver2,
      { method: "DELETE", ...jsonBody({}) }
    );
    assert.equal(deletedReplacement.status, 200);
    const deletedAgain = await requestJson(
      `${context.baseUrl}/documents/${replacement.id}`,
      context.tokens.driver2,
      { method: "DELETE", ...jsonBody({}) }
    );
    assert.equal(deletedAgain.status, 200);
    const deletedDownload = await request(
      `${context.baseUrl}/documents/files/${encodeURIComponent(replacement.storageKey)}`,
      context.tokens.driver2
    );
    assert.equal(deletedDownload.status, 404);
    const listAfterDelete = await requestJson(`${context.baseUrl}/documents`, context.tokens.driver2);
    assert.ok(!listAfterDelete.payload.data.some((entry) => entry.id === replacement.id));

    const approvedUpload = await requestJson(`${context.baseUrl}/documents`, context.tokens.driver2, {
      method: "POST",
      body: buildUploadForm({ fileName: "licencia-aprobada.png" })
    });
    uploaded.push(approvedUpload.payload.data);
    await requestJson(
      `${context.baseUrl}/documents/${approvedUpload.payload.data.id}/review`,
      context.tokens.admin,
      { method: "PATCH", ...jsonBody({ reviewStatus: "approved", reviewNotes: "Correcto" }) }
    );
    const driverApprovedDelete = await requestJson(
      `${context.baseUrl}/documents/${approvedUpload.payload.data.id}`,
      context.tokens.driver2,
      { method: "DELETE", ...jsonBody({}) }
    );
    assert.equal(driverApprovedDelete.status, 409);
    const adminWithoutReason = await requestJson(
      `${context.baseUrl}/documents/${approvedUpload.payload.data.id}`,
      context.tokens.admin,
      { method: "DELETE", ...jsonBody({}) }
    );
    assert.equal(adminWithoutReason.status, 400);
    const adminDelete = await requestJson(
      `${context.baseUrl}/documents/${approvedUpload.payload.data.id}`,
      context.tokens.admin,
      { method: "DELETE", ...jsonBody({ deleteReason: "Documento duplicado" }) }
    );
    assert.equal(adminDelete.status, 200);
    const driverAdminList = await requestJson(`${context.baseUrl}/documents/admin?includeDeleted=true`, context.tokens.driver2);
    assert.equal(driverAdminList.status, 403);
    const deletedAdminList = await requestJson(`${context.baseUrl}/documents/admin?includeDeleted=true`, context.tokens.admin);
    assert.ok(deletedAdminList.payload.data.some((entry) => entry.id === approvedUpload.payload.data.id && entry.deletedAt));

    const invalidUpload = await requestJson(`${context.baseUrl}/documents`, context.tokens.driver2, {
      method: "POST",
      body: buildUploadForm({ mimeType: "text/plain", fileName: "invalid.txt" })
    });
    assert.equal(invalidUpload.status, 415);
    const oversizedUpload = await requestJson(`${context.baseUrl}/documents`, context.tokens.driver2, {
      method: "POST",
      body: buildUploadForm({ contents: Buffer.alloc(15 * 1024 * 1024 + 1), fileName: "grande.png" })
    });
    assert.equal(oversizedUpload.status, 413);

    const assetsBeforeStoreFailure = listLocalAssets();
    const originalCreateDocument = context.store.createDocument;
    context.store.createDocument = async () => { throw new Error("simulated document store failure"); };
    const failedCreate = await requestJson(`${context.baseUrl}/documents`, context.tokens.driver2, {
      method: "POST",
      body: buildUploadForm({ fileName: "huerfano.png" })
    });
    context.store.createDocument = originalCreateDocument;
    assert.equal(failedCreate.status, 422);
    assert.deepEqual(listLocalAssets(), assetsBeforeStoreFailure);

    const localAssetName = `delete-test-${Date.now()}.png`;
    const localAssetPath = path.resolve(uploadsDirectory, localAssetName);
    fs.writeFileSync(localAssetPath, "asset");
    assert.equal((await deleteDocumentAsset({ storageType: "local", storageKey: localAssetName })).deleted, true);
    assert.equal((await deleteDocumentAsset({ storageType: "local", storageKey: localAssetName })).alreadyMissing, true);
    let gridFsDeleted = false;
    await deleteDocumentAsset(
      { storageType: "mongo_gridfs", storageKey: "507f1f77bcf86cd799439011" },
      { gridFsBucket: { delete: async () => { gridFsDeleted = true; } } }
    );
    assert.equal(gridFsDeleted, true);
    let cloudinaryDeleted = false;
    await deleteDocumentAsset(
      { storageType: "cloudinary", storageKey: "document-key", mimeType: "image/png" },
      { cloudinaryClient: { uploader: { destroy: async () => { cloudinaryDeleted = true; return { result: "ok" }; } } } }
    );
    assert.equal(cloudinaryDeleted, true);
    let downloadOptions = null;
    const expiringUrl = getCloudinaryDownloadUrl(
      {
        storageKey: "tenant/document-key",
        mimeType: "application/pdf",
        originalFileName: "evidencia.pdf"
      },
      {
        now: () => 1_787_000_000_000,
        cloudinaryClient: {
          utils: {
            private_download_url(publicId, format, options) {
              downloadOptions = { publicId, format, ...options };
              return "https://provider.test/expiring-download";
            }
          }
        }
      }
    );
    assert.equal(expiringUrl, "https://provider.test/expiring-download");
    assert.deepEqual(downloadOptions, {
      publicId: "tenant/document-key",
      format: "pdf",
      attachment: false,
      expires_at: 1_787_000_300,
      resource_type: "raw",
      type: "authenticated"
    });

    console.log("ok - ciclo documental de conductor y administrador protegido");
  } finally {
    uploaded.forEach(removeUploadedAsset);
    await context.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
