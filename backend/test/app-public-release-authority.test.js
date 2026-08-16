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
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../src/modules/app/routes.js"),
    "utf8"
  );

  for (const forbidden of ["1.0.2", "1drv.ms", "2026-07-20", "42 MB"]) {
    assert.equal(
      routeSource.includes(forbidden),
      false,
      `La ruta publica de release no debe conservar el fallback legado: ${forbidden}`
    );
  }

  const configuredStore = createEmbeddedStore();
  await withServer(configuredStore, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/app/info`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.data.version, "string");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
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

  console.log("ok - public app release info is persisted authority only and never stale fallback");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
