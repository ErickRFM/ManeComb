const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

async function withServer(store, callback) {
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "release-authority-test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function main() {
  const routeSource = [
    "../src/modules/app/routes.js",
    "../src/data/seedData.js"
  ].map((relativePath) => fs.readFileSync(path.join(__dirname, relativePath), "utf8")).join("\n");

  for (const forbidden of ["1.0.2", "1drv.ms", "2026-07-20", "42 MB"]) {
    assert.equal(
      routeSource.includes(forbidden),
      false,
      `La ruta publica de release no debe conservar el fallback legado: ${forbidden}`
    );
  }

  const configuredStore = createEmbeddedStore();
  configuredStore.updateAppConfig({
    name: "ManeComb",
    version: "1.3.0",
    buildNumber: 22,
    sourceCommit: "a".repeat(40),
    sha256: "b".repeat(64),
    apkUrl: "https://github.com/ErickRFM/ManeComb/releases/download/v1.3.0/app-release.apk",
    releaseDate: "2026-08-30",
    releaseNotes: ["Cierre certificado"],
    mandatory: false
  });
  await withServer(configuredStore, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app/info`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.version, "1.3.0");
    assert.equal(payload.data.buildNumber, 22);
    assert.equal(payload.data.sourceCommit, "a".repeat(40));
    assert.equal(payload.data.sha256, "b".repeat(64));
    assert.deepEqual(payload.data.releaseNotes, ["Cierre certificado"]);
    assert.equal(payload.data.mandatory, false);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });

  const incompleteStore = createEmbeddedStore();
  incompleteStore.updateAppConfig({
    version: "1.3.0",
    apkUrl: "https://example.test/stale.apk"
  });
  await withServer(incompleteStore, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app/info`);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.deepEqual(payload, {
      ok: false,
      code: "app_release_not_certified",
      message: "La publicacion de la aplicacion no tiene procedencia completa"
    });
    assert.equal(JSON.stringify(payload).includes("stale.apk"), false);
  });

  const unconfiguredStore = createEmbeddedStore();
  unconfiguredStore.getAppConfig = async () => null;

  await withServer(unconfiguredStore, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app/info`);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.deepEqual(payload, {
      ok: false,
      code: "app_release_not_configured",
      message: "La informacion publica de la aplicacion no esta configurada"
    });
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.equal(JSON.stringify(payload).includes("apkUrl"), false);
    assert.equal(JSON.stringify(payload).includes("version"), false);
  });

  console.log("ok - public app release info is certified persisted authority only and never stale fallback");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
