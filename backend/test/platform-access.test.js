process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const assert = require("node:assert/strict");
const crypto = require("crypto");
const http = require("http");
const jwt = require("jsonwebtoken");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signPlatformToken } = require("../src/utils/platform-jwt");
const { createPlatformSession, markPlatformSessionMfaVerified } = require("../src/services/platform-sessions");
const {
  PlatformAccessConfigurationError,
  getPlatformAccessConfiguration,
  assertPlatformAccessConfiguration
} = require("../src/config/platform-access");
const {
  PlatformAccessUnavailableError,
  createPlatformAccessVerifier,
  platformAccess,
  clearPlatformAccessJwksCache
} = require("../src/middlewares/platform-access");

function mockResponse() {
  const state = { status: 200, body: null };
  return {
    state,
    status(code) { state.status = code; return this; },
    json(body) { state.body = body; return this; }
  };
}

function requestJson(server, { path, platformToken, accessToken }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const request = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path,
      method: "GET",
      headers: {
        ...(platformToken ? { authorization: `Bearer ${platformToken}` } : {}),
        ...(accessToken ? { "cf-access-jwt-assertion": accessToken } : {})
      }
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function createAccessFixture() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = "platform-access-test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { publicKey, privateKey, jwk };
}

function signAccessToken(privateKey, { issuer, audience, email = "owner@manecomb.com", subject = "access-user-1" }) {
  return jwt.sign(
    { type: "app", email, identity_nonce: "test-identity-nonce" },
    privateKey,
    {
      algorithm: "RS256",
      keyid: "platform-access-test-key",
      issuer,
      audience,
      subject,
      expiresIn: "5m"
    }
  );
}

async function main() {
  let passed = 0;
  let total = 0;
  async function test(name, fn) {
    total += 1;
    try {
      await fn();
      passed += 1;
      console.log("PASS:", name);
    } catch (error) {
      console.error("FAIL:", name, "-", error.message);
      process.exit(1);
    }
  }

  const fixture = createAccessFixture();
  const audience = "platform-access-audience-test-123456";
  const issuer = "http://127.0.0.1:17777";
  const config = {
    enabled: true,
    issuer,
    audience,
    jwksUrl: `${issuer}/cdn-cgi/access/certs`,
    headerName: "cf-access-jwt-assertion"
  };

  await test("disabled configuration stays optional", async () => {
    const disabled = getPlatformAccessConfiguration({ PLATFORM_ACCESS_ENFORCEMENT_ENABLED: "false" });
    assert.equal(disabled.enabled, false);
    assert.doesNotThrow(() => assertPlatformAccessConfiguration({ config: disabled, allowHttp: true }));
  });

  await test("enabled incomplete configuration fails closed", async () => {
    assert.throws(
      () => assertPlatformAccessConfiguration({
        config: { enabled: true, issuer: "", audience: "", jwksUrl: "", headerName: "cf-access-jwt-assertion" },
        allowHttp: true
      }),
      PlatformAccessConfigurationError
    );
  });

  let fetchCount = 0;
  const verifier = createPlatformAccessVerifier({
    allowHttp: true,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ keys: [fixture.jwk] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await test("valid Access JWT verifies issuer audience signature and safe identity", async () => {
    clearPlatformAccessJwksCache();
    const token = signAccessToken(fixture.privateKey, { issuer, audience });
    const identity = await verifier(token, config);
    assert.equal(identity.sub, "access-user-1");
    assert.equal(identity.email, "owner@manecomb.com");
    assert.deepEqual(identity.audience, [audience]);
    assert.equal(identity.issuer, issuer);
    assert.equal(identity.type, "app");
    assert.equal(JSON.stringify(identity).includes("exp"), false);
  });

  await test("JWKS is cached and does not refetch on every request", async () => {
    const token = signAccessToken(fixture.privateKey, { issuer, audience, subject: "access-user-2" });
    const before = fetchCount;
    await verifier(token, config);
    await verifier(token, config);
    assert.equal(fetchCount, before);
  });

  await test("wrong audience and issuer are rejected", async () => {
    const wrongAudience = signAccessToken(fixture.privateKey, { issuer, audience: "wrong-audience-123456" });
    await assert.rejects(() => verifier(wrongAudience, config), /audience/i);

    const wrongIssuer = signAccessToken(fixture.privateKey, { issuer: "http://127.0.0.1:18888", audience });
    await assert.rejects(() => verifier(wrongIssuer, config), /issuer/i);
  });

  await test("JWKS outage is treated as unavailable rather than authenticated", async () => {
    clearPlatformAccessJwksCache();
    const unavailableVerifier = createPlatformAccessVerifier({
      allowHttp: true,
      fetchImpl: async () => { throw new Error("network down"); },
      timeoutMs: 50
    });
    const token = signAccessToken(fixture.privateKey, { issuer, audience });
    await assert.rejects(() => unavailableVerifier(token, config), PlatformAccessUnavailableError);
  });

  await test("middleware bypasses only when enforcement is disabled", async () => {
    const previous = process.env.PLATFORM_ACCESS_ENFORCEMENT_ENABLED;
    process.env.PLATFORM_ACCESS_ENFORCEMENT_ENABLED = "false";
    let called = false;
    await platformAccess({ headers: {} }, mockResponse(), () => { called = true; });
    assert.equal(called, true);
    process.env.PLATFORM_ACCESS_ENFORCEMENT_ENABLED = previous;
  });

  const jwksServer = http.createServer((req, res) => {
    if (req.url === "/cdn-cgi/access/certs") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [fixture.jwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  const jwksAddress = jwksServer.address();
  const liveIssuer = `http://127.0.0.1:${jwksAddress.port}`;
  process.env.PLATFORM_ACCESS_ENFORCEMENT_ENABLED = "true";
  process.env.PLATFORM_ACCESS_ISSUER = liveIssuer;
  process.env.PLATFORM_ACCESS_AUDIENCE = audience;
  process.env.PLATFORM_ACCESS_JWKS_URL = `${liveIssuer}/cdn-cgi/access/certs`;
  clearPlatformAccessJwksCache();

  const store = createEmbeddedStore();
  const owner = store.createPlatformUser({
    name: "Private Access Owner",
    email: "private-access-owner@manecomb.com",
    password: "PlatformTest@123",
    role: "platform_owner"
  });
  const context = {
    app: { locals: { store } },
    headers: { "user-agent": "private-access-e2e" },
    ip: "127.0.0.1"
  };
  const { session } = await createPlatformSession(owner.id, context);
  await markPlatformSessionMfaVerified(session.id);
  const platformToken = signPlatformToken({ _id: owner.id, role: owner.role }, session.id);
  const accessToken = signAccessToken(fixture.privateKey, { issuer: liveIssuer, audience });

  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  });
  const apiServer = http.createServer(app);
  await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));

  try {
    await test("E2E requires both Cloudflare Access JWT and Platform token", async () => {
      const valid = await requestJson(apiServer, {
        path: "/api/platform/capabilities",
        platformToken,
        accessToken
      });
      assert.equal(valid.status, 200);
      assert.equal(valid.body.ok, true);
      assert.equal(valid.body.data.user.email, owner.email);

      const missingAccess = await requestJson(apiServer, {
        path: "/api/platform/capabilities",
        platformToken
      });
      assert.equal(missingAccess.status, 403);
      assert.equal(missingAccess.body.message, "Acceso privado requerido");

      const missingPlatform = await requestJson(apiServer, {
        path: "/api/platform/capabilities",
        accessToken
      });
      assert.equal(missingPlatform.status, 401);
    });

    await test("E2E rejects a signed Access JWT for another application", async () => {
      const wrongAccess = signAccessToken(fixture.privateKey, {
        issuer: liveIssuer,
        audience: "other-application-audience-12345"
      });
      const response = await requestJson(apiServer, {
        path: "/api/platform/capabilities",
        platformToken,
        accessToken: wrongAccess
      });
      assert.equal(response.status, 403);
      assert.equal(response.body.message, "Acceso privado inválido");
    });
  } finally {
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => jwksServer.close(resolve));
  }

  console.log(`\nAll ${passed}/${total} platform-access tests passed`);
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
