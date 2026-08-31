process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");
const { signPlatformToken } = require("../src/utils/platform-jwt");
const {
  createPlatformSession,
  markPlatformSessionMfaVerified
} = require("../src/services/platform-sessions");

async function createPlatformToken(store, role, suffix) {
  const user = store.createPlatformUser({
    name: `Platform ${role}`,
    email: `${suffix}@manecomb.test`,
    password: "PlatformTest@123",
    role
  });
  const requestContext = {
    app: { locals: { store } },
    headers: { "user-agent": "app-global-authority-test" },
    ip: "127.0.0.1"
  };
  const { session } = await createPlatformSession(user.id, requestContext);
  await markPlatformSessionMfaVerified(session.id);
  return signPlatformToken({ _id: user.id, role: user.role }, session.id);
}

async function createContext() {
  const store = createEmbeddedStore();
  store.updateAppConfig({
    name: "ManeComb",
    version: "1.0.2",
    buildNumber: 21,
    sourceCommit: "a".repeat(40),
    sha256: "b".repeat(64),
    apkUrl: "https://github.com/ErickRFM/ManeComb/releases/download/v1.0.2/app-release.apk",
    releaseDate: "2026-08-08",
    releaseNotes: ["Version anterior"],
    mandatory: false,
    versionHistory: [{
      version: "1.0.2",
      date: "2026-08-08",
      current: true,
      notes: ["Version anterior"],
      mandatory: false,
      internalSecret: "must-not-persist"
    }]
  });
  const operationalAdmin = await store.createUser({
    name: "Legacy Operational Admin",
    email: `legacy-app-global-${Date.now()}@manecomb.test`,
    password: "Ruta123!",
    role: "admin",
    accountType: "operations",
    organizationId: "manecomb-demo",
    companyId: "manecomb-demo",
    userStatus: "active",
    status: "offline"
  });

  await Promise.resolve(store.recordAppEvent({
    type: "api_error",
    scope: "api",
    level: "warning",
    status: "500",
    route: "/api/private/example",
    method: "GET",
    userId: "must-not-leak-user",
    durationMs: 42,
    message: "must-not-leak-message",
    metadata: { accessToken: "must-not-leak-token" },
    createdAt: new Date().toISOString()
  }));
  if (store.recordDeviceVersion) {
    await Promise.resolve(store.recordDeviceVersion("device-user-1", {
      version: "1.0.2",
      platform: "android",
      deviceName: "test-device"
    }));
  }

  const platformAdminToken = await createPlatformToken(
    store,
    "platform_admin",
    `platform-admin-app-global-${Date.now()}`
  );
  const platformOwnerToken = await createPlatformToken(
    store,
    "platform_owner",
    `platform-owner-app-global-${Date.now()}`
  );

  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "app-global-authority-test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api`,
    legacyAdminToken: signToken(operationalAdmin),
    platformAdminToken,
    platformOwnerToken,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

async function requestJson(baseUrl, route, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { response, payload: await response.json() };
}

function walkJavaScriptFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJavaScriptFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(absolute);
    }
  }
  return files;
}

function assertLegacyAdminCannotOwnGlobalAuthority() {
  const srcRoot = path.join(__dirname, "../src");
  const forbiddenGlobalAuthorities = [
    "getOperationalInsights",
    "getDeviceVersionStats",
    "updateAppConfig",
    "getPaymentReadiness"
  ];

  for (const file of walkJavaScriptFiles(srcRoot)) {
    const source = fs.readFileSync(file, "utf8");
    const usesLegacyAdmin = source.includes("require-admin") || source.includes("requireAdmin");
    if (!usesLegacyAdmin) continue;

    for (const authority of forbiddenGlobalAuthorities) {
      assert.equal(
        source.includes(authority),
        false,
        `${path.relative(srcRoot, file)} must not combine requireAdmin with global authority ${authority}`
      );
    }
  }

  const appRoutes = fs.readFileSync(path.join(srcRoot, "modules/app/routes.js"), "utf8");
  assert.equal(appRoutes.includes("requireAdmin"), false);
  assert.equal(appRoutes.includes("router.patch"), false);
  assert.equal(appRoutes.includes("device-stats"), false);

  const opsRoutes = fs.readFileSync(path.join(srcRoot, "modules/ops/routes.js"), "utf8");
  assert.equal(opsRoutes.includes("getOperationalInsights"), false);
  assert.equal(opsRoutes.includes("getPaymentReadiness"), false);
  assert.equal(opsRoutes.includes("platform_authority_required"), true);
}

async function main() {
  assertLegacyAdminCannotOwnGlobalAuthority();

  const context = await createContext();
  try {
    const publicInfo = await requestJson(context.baseUrl, "/app/info");
    assert.equal(publicInfo.response.status, 200);
    assert.equal(publicInfo.payload.ok, true);
    assert.equal(typeof publicInfo.payload.data.version, "string");

    const legacyStats = await requestJson(context.baseUrl, "/app/device-stats", {
      token: context.legacyAdminToken
    });
    assert.equal(legacyStats.response.status, 404);

    const legacyUpdate = await requestJson(context.baseUrl, "/app/info", {
      token: context.legacyAdminToken,
      method: "PATCH",
      body: { version: "9.9.9" }
    });
    assert.equal(legacyUpdate.response.status, 404);

    for (const route of ["/ops/observability", "/ops/readiness/payments"]) {
      const retired = await requestJson(context.baseUrl, route, {
        token: context.legacyAdminToken
      });
      assert.equal(retired.response.status, 410);
      assert.deepEqual(retired.payload, {
        ok: false,
        code: "platform_authority_required",
        message: "Este recurso global fue retirado del plano operativo"
      });
    }

    const observability = await requestJson(
      context.baseUrl,
      "/platform/system/observability?hours=24&limit=10",
      { token: context.platformAdminToken }
    );
    assert.equal(observability.response.status, 200);
    assert.equal(observability.payload.ok, true);
    assert.equal(typeof observability.payload.data.apiErrors, "number");
    const observabilityText = JSON.stringify(observability.payload);
    for (const forbidden of [
      "must-not-leak-user",
      "must-not-leak-message",
      "must-not-leak-token",
      "accessToken",
      "metadata",
      "userId"
    ]) {
      assert.equal(observabilityText.includes(forbidden), false);
    }

    const platformStats = await requestJson(context.baseUrl, "/platform/system/app/device-stats", {
      token: context.platformAdminToken
    });
    assert.equal(platformStats.response.status, 200);
    assert.equal(platformStats.payload.ok, true);
    assert.equal(typeof platformStats.payload.data.total, "number");

    const forbiddenForAdmin = await requestJson(context.baseUrl, "/platform/system/app/info", {
      token: context.platformAdminToken,
      method: "PATCH",
      body: { version: "1.0.3" }
    });
    assert.equal(forbiddenForAdmin.response.status, 403);

    const invalidOwnerPatch = await requestJson(context.baseUrl, "/platform/system/app/info", {
      token: context.platformOwnerToken,
      method: "PATCH",
      body: { version: "1.0.3", internalSecret: "must-not-persist" }
    });
    assert.equal(invalidOwnerPatch.response.status, 400);
    assert.equal(invalidOwnerPatch.payload.code, "invalid_app_config");

    const incompletePublication = await requestJson(context.baseUrl, "/platform/system/app/info", {
      token: context.platformOwnerToken,
      method: "PATCH",
      body: { version: "1.0.3" }
    });
    assert.equal(incompletePublication.response.status, 400);
    assert.match(incompletePublication.payload.message, /publicacion es atomica/i);

    const invalidDigest = await requestJson(context.baseUrl, "/platform/system/app/info", {
      token: context.platformOwnerToken,
      method: "PATCH",
      body: {
        version: "1.0.3",
        buildNumber: 22,
        sourceCommit: "c".repeat(40),
        sha256: "not-a-digest",
        apkUrl: "https://example.test/app-release.apk",
        releaseDate: "2026-08-09"
      }
    });
    assert.equal(invalidDigest.response.status, 400);
    assert.match(invalidDigest.payload.message, /sha256/i);

    const ownerUpdate = await requestJson(context.baseUrl, "/platform/system/app/info", {
      token: context.platformOwnerToken,
      method: "PATCH",
      body: {
        version: "1.0.3",
        buildNumber: 22,
        sourceCommit: "c".repeat(40),
        sha256: "d".repeat(64),
        apkUrl: "https://github.com/ErickRFM/ManeComb/releases/download/v1.0.3/app-release.apk",
        releaseDate: "2026-08-09",
        status: "disponible",
        size: "42 MB",
        androidMin: "8.0",
        releaseNotes: ["Autoridad global migrada"],
        mandatory: false
      }
    });
    assert.equal(ownerUpdate.response.status, 200);
    assert.equal(ownerUpdate.payload.ok, true);
    assert.equal(ownerUpdate.payload.data.version, "1.0.3");
    assert.equal(ownerUpdate.payload.data.buildNumber, 22);
    assert.equal(ownerUpdate.payload.data.sourceCommit, "c".repeat(40));
    assert.equal(ownerUpdate.payload.data.sha256, "d".repeat(64));
    assert.equal(ownerUpdate.payload.data.mandatory, false);
    assert.deepEqual(ownerUpdate.payload.data.versionHistory.map((entry) => ({
      version: entry.version,
      current: entry.current
    })), [
      { version: "1.0.3", current: true },
      { version: "1.0.2", current: false }
    ]);
    assert.equal(JSON.stringify(ownerUpdate.payload).includes("internalSecret"), false);

    const updatedPublicInfo = await requestJson(context.baseUrl, "/app/info");
    assert.equal(updatedPublicInfo.response.status, 200);
    assert.equal(updatedPublicInfo.payload.data.version, "1.0.3");
    assert.equal(updatedPublicInfo.payload.data.sha256, "d".repeat(64));
    assert.equal(JSON.stringify(updatedPublicInfo.payload).includes("internalSecret"), false);

    console.log("ok - global app and observability authority belongs only to Platform");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
