const assert = require("node:assert/strict");
const http = require("node:http");

process.env.RENDER = "true";
process.env.JWT_SECRET = "proxy-test-secret-with-at-least-32-characters";
delete process.env.TRUST_PROXY;

const createApp = require("../src/app");
const { TRUST_PROXY } = require("../src/config/env");
const { createEmbeddedStore } = require("../src/data/store");

async function testRenderProxyHeaders() {
  assert.equal(TRUST_PROXY, true);

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

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
      headers: {
        "X-Forwarded-For": "203.0.113.10"
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.environment, "production");
    assert.equal(payload.render, true);
    assert.equal(payload.trustProxy, true);
    assert.equal(payload.version, "1.0.0");
    assert.ok(typeof payload.uptimeSeconds === "number");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

testRenderProxyHeaders()
  .then(() => {
    console.log("ok - render proxy headers");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
