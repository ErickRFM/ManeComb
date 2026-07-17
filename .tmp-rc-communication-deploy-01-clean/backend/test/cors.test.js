const assert = require("node:assert/strict");
const http = require("node:http");

process.env.CLIENT_ORIGIN = "https://example-client.test";

const createApp = require("../src/app");
const { CLIENT_ORIGINS, isClientOriginAllowed } = require("../src/config/env");
const { createEmbeddedStore } = require("../src/data/store");

async function createTestServer() {
  const app = createApp({
    store: createEmbeddedStore(),
    getDbState: () => ({
      connected: false,
      mode: "embedded"
    })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

async function request(path, origin, method = "OPTIONS") {
  const context = await createTestServer();

  try {
    return await fetch(`${context.url}${path}`, {
      method,
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET"
      }
    });
  } finally {
    await context.close();
  }
}

async function testCorsOrigins() {
  assert.ok(CLIENT_ORIGINS.includes("https://manecomb1.pages.dev"));
  assert.ok(CLIENT_ORIGINS.includes("https://*.manecomb1.pages.dev"));
  assert.ok(CLIENT_ORIGINS.includes("http://localhost:5173"));
  assert.ok(CLIENT_ORIGINS.includes("http://127.0.0.1:5173"));
  assert.ok(CLIENT_ORIGINS.includes("https://example-client.test"));

  assert.equal(isClientOriginAllowed("https://manecomb1.pages.dev"), true);
  assert.equal(isClientOriginAllowed("https://preview.manecomb1.pages.dev"), true);
  assert.equal(isClientOriginAllowed("http://localhost:5173"), true);
  assert.equal(isClientOriginAllowed("https://evil.example.com"), false);

  const origins = [
    "https://manecomb1.pages.dev",
    "https://preview.manecomb1.pages.dev",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ];

  for (const origin of origins) {
    const response = await request("/api/commercial/plans", origin);

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  }
}

testCorsOrigins()
  .then(() => {
    console.log("ok - cors origins");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
