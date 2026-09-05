const assert = require("node:assert/strict");
const http = require("node:http");
const { createRequire } = require("node:module");

// Isolated process, in-memory fixtures only. Exercise the production perimeter.
process.env.NODE_ENV = "production";
process.env.RENDER = "true";
process.env.RENDER_EXTERNAL_URL = "https://manecomb.onrender.com/";
process.env.CLIENT_ORIGIN = "https://manecomb.com,https://admin.manecomb.com,https://manecomb1.pages.dev";
process.env.ENABLE_REDIS = "false";
process.env.ENABLE_QUEUES = "false";
process.env.REQUIRE_MONGO = "false";
process.env.LOG_LEVEL = "error";

// Use the WebSocket implementation already locked by Engine.IO; no new dependency.
const WebSocket = createRequire(require.resolve("engine.io"))("ws");
const createApp = require("../src/app");
const { registerSocketServer } = require("../src/sockets");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");
const { createSessionForRequest, revokeSession } = require("../src/services/sessions");
const { CLIENT_ORIGINS, CORS_ORIGIN, isClientOriginAllowed } = require("../src/config/env");
const guardPath = require.resolve("../src/middlewares/production-origin-guard");

function loadGuard(externalUrl) {
  if (externalUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
  else process.env.RENDER_EXTERNAL_URL = externalUrl;
  delete require.cache[guardPath];
  return require(guardPath);
}

function realtimeAllowed(guard, origin) {
  let called = false;
  let rejection;
  guard.productionRealtimeOriginGuard({ headers: origin === undefined ? {} : { origin } }, null, error => {
    called = true;
    rejection = error;
  });
  assert.equal(called, true);
  if (rejection) assert.equal(rejection.data.code, "ORIGIN_NOT_ALLOWED");
  return !rejection;
}

function connect(url, origin, auth) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${url.replace(/^http/, "ws")}/socket.io/?EIO=4&transport=websocket`, {
      ...(origin === undefined ? {} : { origin }),
      handshakeTimeout: 2000
    });
    let settled = false;
    const timer = setTimeout(() => finish(new Error("socket test timeout")), 3000);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.terminate();
      if (error) reject(error);
      else resolve(result);
    }
    socket.on("unexpected-response", (_req, response) => {
      response.resume();
      finish(null, { status: response.statusCode, state: "origin_rejected" });
    });
    socket.on("error", () => finish(new Error("socket transport failed")));
    socket.on("message", data => {
      const packet = String(data);
      if (packet.startsWith("0")) socket.send(`40${JSON.stringify(auth)}`);
      else if (packet.startsWith("44")) {
        finish(null, { status: 101, state: JSON.parse(packet.slice(2)).message });
      } else if (packet.startsWith("40")) {
        finish(null, { status: 101, state: "connected", socketId: JSON.parse(packet.slice(2)).sid });
      }
    });
  });
}

async function main() {
  const selfOrigin = "https://manecomb.onrender.com";
  const guard = loadGuard(`${selfOrigin}/backend/path?ignored=config#only`);
  const allowed = [undefined, "https://admin.manecomb.com", "https://manecomb1.pages.dev", selfOrigin];
  const denied = [
    "https://evil.example",
    "https://manecomb.onrender.com.evil.example",
    "https://evil.onrender.com",
    "http://manecomb.onrender.com",
    "https://preview.manecomb1.pages.dev",
    "https://manecomb.onrender.com:444",
    "https://manecomb.onrender.com/path",
    "https://manecomb.onrender.com?query=1",
    "https://manecomb.onrender.com#fragment",
    "https://user:pass@manecomb.onrender.com",
    "https://*.onrender.com",
    "null"
  ];
  for (const origin of allowed) assert.equal(realtimeAllowed(guard, origin), true, `allow ${origin}`);
  for (const origin of denied) assert.equal(realtimeAllowed(guard, origin), false, `reject ${origin}`);
  console.log("ok - exact production realtime Origin matrix");

  for (const invalidConfig of [undefined, "", "not-a-url", "http://manecomb.onrender.com", "https://user:pass@manecomb.onrender.com", "https://*.onrender.com"]) {
    const invalidGuard = loadGuard(invalidConfig);
    assert.equal(realtimeAllowed(invalidGuard, selfOrigin), false, "missing/invalid self-origin fails closed");
    assert.equal(realtimeAllowed(invalidGuard, "https://*.onrender.com"), false);
    assert.equal(realtimeAllowed(invalidGuard, undefined), true, "native omission remains compatible");
    assert.equal(realtimeAllowed(invalidGuard, "https://admin.manecomb.com"), true);
  }
  const differentGuard = loadGuard("https://different-service.onrender.com");
  assert.equal(realtimeAllowed(differentGuard, selfOrigin), false, "no hardcoded ManeComb host fallback");
  assert.equal(realtimeAllowed(differentGuard, "https://different-service.onrender.com"), true);
  loadGuard(selfOrigin);
  console.log("ok - Render URL authority, normalization and fail-closed configuration");

  assert.equal(CLIENT_ORIGINS.includes(selfOrigin), false);
  assert.equal(isClientOriginAllowed(selfOrigin), false);
  CORS_ORIGIN(selfOrigin, (error, accepted) => {
    assert.equal(error, null);
    assert.equal(accepted, false);
  });
  assert.equal(guard.isTrustedProductionBrowserOrigin(selfOrigin), false);

  const store = createEmbeddedStore();
  const user = store.getUserById("user-driver-01");
  const { session } = await createSessionForRequest({ headers: {}, socket: { remoteAddress: "127.0.0.1" } }, user);
  const token = signToken(user, session.id); // Test fixture only; never logged.
  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded" }) });
  const server = http.createServer(app);
  const io = registerSocketServer(server, store);
  io.engine.use(guard.productionRealtimeOriginGuard);
  const authenticated = [];
  io.on("connection", socket => authenticated.push({
    userId: socket.data.user.id,
    organizationId: socket.data.user.organizationId,
    role: socket.data.user.role
  }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const origin of allowed) {
      assert.deepEqual(await connect(url, origin, {}), { status: 101, state: "unauthorized" });
      assert.deepEqual(await connect(url, origin, { token: "invalid-test-token" }), { status: 101, state: "unauthorized" });
      const result = await connect(url, origin, { token });
      assert.equal(result.status, 101);
      assert.equal(result.state, "connected");
    }
    assert.deepEqual(authenticated, allowed.map(() => ({ userId: user.id, organizationId: user.organizationId, role: user.role })));
    console.log("ok - real WebSocket + Socket.IO auth: missing/invalid token unauthorized; valid user retains tenant/role");
    for (const origin of denied) {
      assert.deepEqual(await connect(url, origin, { token }), { status: 400, state: "origin_rejected" });
    }
    assert.equal(authenticated.length, allowed.length, "rejected origins never reach authenticated connection");
    for (const invalidToken of [signToken({ ...user, id: "missing-test-user" }), signToken(user, "missing-test-session")]) {
      assert.deepEqual(await connect(url, selfOrigin, { token: invalidToken }), { status: 101, state: "unauthorized" });
    }
    await revokeSession(user.id, session.id, "origin-regression-test");
    assert.deepEqual(await connect(url, selfOrigin, { token }), { status: 101, state: "unauthorized" });
    console.log("ok - untrusted origins rejected even with a valid token; missing user/revoked session unauthorized");

    for (const origin of [selfOrigin, "https://evil.example", "https://evil.onrender.com"]) {
      const response = await fetch(`${url}/api/commercial/plans`, {
        method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" }, signal: AbortSignal.timeout(3000)
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.equal((await response.json()).code, "ORIGIN_NOT_ALLOWED");
    }
    for (const origin of ["https://admin.manecomb.com", "https://manecomb1.pages.dev"]) {
      const response = await fetch(`${url}/api/commercial/plans`, {
        method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" }, signal: AbortSignal.timeout(3000)
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
    }
    console.log("ok - normal HTTP CORS/production guard unchanged; backend self-origin remains denied");
  } finally {
    await new Promise(resolve => io.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
