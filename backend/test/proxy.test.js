const assert = require("node:assert/strict");
const http = require("node:http");

process.env.RENDER = "true";
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

    assert.equal(response.status, 200);
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
