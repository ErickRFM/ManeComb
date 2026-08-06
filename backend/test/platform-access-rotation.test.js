process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const {
  clearPlatformAccessJwksCache,
  createPlatformAccessVerifier
} = require("../src/middlewares/platform-access");

function createAccessFixture(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwk };
}

function signAccessToken(privateKey, { issuer, audience, kid, subject }) {
  return jwt.sign(
    { type: "app", email: `${subject}@manecomb.com` },
    privateKey,
    {
      algorithm: "RS256",
      keyid: kid,
      issuer,
      audience,
      subject,
      expiresIn: "5m"
    }
  );
}

async function main() {
  const issuer = "http://127.0.0.1:17779";
  const audience = "platform-access-rotation-audience-123456";
  const config = {
    enabled: true,
    issuer,
    audience,
    jwksUrl: `${issuer}/cdn-cgi/access/certs`,
    headerName: "cf-access-jwt-assertion"
  };
  const original = createAccessFixture("access-key-original");
  const rotated = createAccessFixture("access-key-rotated");
  let activeKeys = [original.jwk];
  let fetchCount = 0;

  const verifier = createPlatformAccessVerifier({
    allowHttp: true,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ keys: activeKeys }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  clearPlatformAccessJwksCache();

  const originalToken = signAccessToken(original.privateKey, {
    issuer,
    audience,
    kid: original.jwk.kid,
    subject: "access-original"
  });
  const originalIdentity = await verifier(originalToken, config);
  assert.equal(originalIdentity.sub, "access-original");
  assert.equal(fetchCount, 1, "La primera verificación debe descargar JWKS una vez");

  activeKeys = [rotated.jwk];
  const rotatedToken = signAccessToken(rotated.privateKey, {
    issuer,
    audience,
    kid: rotated.jwk.kid,
    subject: "access-rotated"
  });
  const rotatedIdentity = await verifier(rotatedToken, config);

  assert.equal(rotatedIdentity.sub, "access-rotated");
  assert.equal(
    fetchCount,
    2,
    "Un kid desconocido debe forzar exactamente una recarga de JWKS antes de rechazar el token"
  );

  const cachedIdentity = await verifier(rotatedToken, config);
  assert.equal(cachedIdentity.sub, "access-rotated");
  assert.equal(fetchCount, 2, "La clave rotada debe reutilizar el nuevo cache");

  console.log("PASS: Cloudflare Access JWKS rotation refreshes once and remains cached");
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
