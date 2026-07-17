const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

process.env.RENDER = "true";
process.env.JWT_SECRET = "proxy-test-secret-with-at-least-32-characters";
delete process.env.TRUST_PROXY;

const createApp = require("../src/app");
const { TRUST_PROXY } = require("../src/config/env");
const { createEmbeddedStore } = require("../src/data/store");
const { enterpriseRateLimit } = require("../src/middlewares/enterprise-rate-limit");

async function withServer(app, handler) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await handler(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

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
    assert.equal(payload.version, "1.0.0");
    assert.ok(typeof payload.uptimeSeconds === "number");
    assert.ok(typeof payload.timestamp === "string");
    assert.equal("auth" in payload, false);
    assert.equal("environment" in payload, false);
    assert.equal("trustProxy" in payload, false);
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

async function testRateLimiterUsesExpressIp() {
  const directApp = express();
  directApp.set("trust proxy", false);
  directApp.get("/", enterpriseRateLimit({ scope: "proxy-direct-test", max: 1, windowMs: 60_000 }), (req, res) => res.json({ ip: req.ip }));
  await withServer(directApp, async (baseUrl) => {
    const first = await fetch(baseUrl, { headers: { "x-forwarded-for": "203.0.113.10" } });
    const second = await fetch(baseUrl, { headers: { "x-forwarded-for": "198.51.100.20" } });
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  });

  const proxyApp = express();
  proxyApp.set("trust proxy", 1);
  proxyApp.get("/", enterpriseRateLimit({ scope: "proxy-trusted-test", max: 1, windowMs: 60_000 }), (req, res) => res.json({ ip: req.ip }));
  await withServer(proxyApp, async (baseUrl) => {
    const first = await fetch(baseUrl, { headers: { "x-forwarded-for": "203.0.113.10" } });
    const second = await fetch(baseUrl, { headers: { "x-forwarded-for": "198.51.100.20" } });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  });
}

Promise.all([testRenderProxyHeaders(), testRateLimiterUsesExpressIp()])
  .then(() => {
    console.log("ok - render proxy headers");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
