const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  AUTHENTICATED_API_MAX,
  AUTHENTICATED_API_WINDOW_MS,
  GENERAL_API_MAX,
  MEDIA_READ_MAX,
  authenticatedApiKey,
  createRateLimitHandler,
  getVerifiedBearerIdentity,
  isAuthApiRequest,
  isAuthRouteWithDedicatedLimiter,
  isMediaReadRequest,
  selectGeneralApiRateLimitScope,
  shouldSkipGeneralApiRateLimit
} = require("../src/middlewares/api-rate-limit");
const { signToken } = require("../src/utils/jwt");

const operationalToken = signToken({
  id: "rate-limit-user",
  role: "DRIVER",
  email: "rate-limit@example.test",
  organizationId: "rate-limit-org"
});

assert.equal(
  isMediaReadRequest({ method: "GET", originalUrl: "/api/chat/media/mongo__abc" }),
  true
);
assert.equal(
  isMediaReadRequest({ method: "GET", originalUrl: "/api/chat/media/mongo__abc?download=1" }),
  true
);
assert.equal(
  isMediaReadRequest({ method: "GET", originalUrl: "/api/radio/messages/message-1/audio" }),
  true
);
assert.equal(
  isMediaReadRequest({ method: "POST", originalUrl: "/api/chat/media/mongo__abc" }),
  false
);
assert.equal(
  isMediaReadRequest({ method: "GET", originalUrl: "/api/radio/messages?channelId=general" }),
  false
);
assert.equal(
  isMediaReadRequest({ method: "GET", originalUrl: "/api/chat/conversations" }),
  false
);

assert.equal(GENERAL_API_MAX, 200);
assert.equal(AUTHENTICATED_API_MAX, 120);
assert.equal(AUTHENTICATED_API_WINDOW_MS, 60_000);
assert.equal(MEDIA_READ_MAX, 180);

assert.equal(isAuthApiRequest({ originalUrl: "/api/auth/login" }), true);
assert.equal(isAuthApiRequest({ originalUrl: "/api/auth/me?appVersion=1.3.0" }), true);
for (const pathName of [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password"
]) {
  const request = { method: "POST", originalUrl: pathName, headers: {} };
  assert.equal(isAuthRouteWithDedicatedLimiter(request), true, `${pathName} must own an explicit limiter`);
  assert.equal(selectGeneralApiRateLimitScope(request), "skip", `${pathName} must not be double-limited`);
}
assert.equal(
  isAuthRouteWithDedicatedLimiter({ method: "GET", originalUrl: "/api/auth/login", headers: {} }),
  false,
  "Method is part of the explicit limiter authority"
);

const authenticatedOperationalRequest = {
  method: "GET",
  originalUrl: "/api/locations/live",
  headers: { authorization: `Bearer ${operationalToken}` }
};
assert.equal(
  shouldSkipGeneralApiRateLimit(authenticatedOperationalRequest),
  true,
  "Authenticated operational traffic must not consume the anonymous perimeter bucket"
);
assert.equal(
  selectGeneralApiRateLimitScope(authenticatedOperationalRequest),
  "authenticated",
  "Verified Bearer traffic must consume the bounded authenticated perimeter"
);
assert.deepEqual(getVerifiedBearerIdentity(authenticatedOperationalRequest), {
  organizationId: "rate-limit-org",
  sub: "rate-limit-user"
});
assert.equal(
  authenticatedApiKey(authenticatedOperationalRequest),
  "auth:rate-limit-org:rate-limit-user",
  "Authenticated quota must be isolated per tenant and user"
);

const invalidBearerRequest = {
  method: "GET",
  originalUrl: "/api/locations/live",
  headers: { authorization: "Bearer invalid-credential" }
};
assert.equal(
  shouldSkipGeneralApiRateLimit(invalidBearerRequest),
  false,
  "Invalid Bearer text must not bypass the anonymous perimeter bucket"
);
assert.equal(selectGeneralApiRateLimitScope(invalidBearerRequest), "anonymous");
assert.equal(
  selectGeneralApiRateLimitScope({ method: "GET", originalUrl: "/api/public-probe", headers: {} }),
  "anonymous",
  "Unauthenticated non-Auth traffic remains protected by the general limiter"
);

// Auth routes without their own limiter must fail closed into the same bounded
// perimeter as every other API route. This includes malformed or revoked-looking
// credentials: cryptographic verification only chooses the quota key; it never
// grants endpoint authorization.
assert.equal(
  selectGeneralApiRateLimitScope({
    method: "GET",
    originalUrl: "/api/auth/me?appVersion=1.3.0",
    headers: { authorization: "Bearer invalid-credential" }
  }),
  "anonymous"
);
assert.equal(
  selectGeneralApiRateLimitScope({
    method: "GET",
    originalUrl: "/api/auth/me?appVersion=1.3.0",
    headers: { authorization: `Bearer ${operationalToken}` }
  }),
  "authenticated"
);
assert.equal(
  selectGeneralApiRateLimitScope({ method: "POST", originalUrl: "/api/auth/logout", headers: {} }),
  "anonymous"
);
assert.equal(
  selectGeneralApiRateLimitScope({
    method: "POST",
    originalUrl: "/api/auth/logout-all",
    headers: { authorization: `Bearer ${operationalToken}` }
  }),
  "authenticated"
);
assert.equal(
  selectGeneralApiRateLimitScope({
    method: "PUT",
    originalUrl: "/api/auth/e2ee-backup",
    headers: { authorization: `Bearer ${operationalToken}` }
  }),
  "authenticated"
);

// A representative reconciliation is about a dozen operational reads. The
// authenticated burst perimeter intentionally permits at least ten of those in
// a minute, while still imposing a hard per-user/tenant ceiling.
const reconciliationBurstSize = 12;
assert.ok(reconciliationBurstSize * 10 <= AUTHENTICATED_API_MAX);
assert.equal(
  Array.from({ length: reconciliationBurstSize }, () => authenticatedOperationalRequest)
    .every((request) => selectGeneralApiRateLimitScope(request) === "authenticated"),
  true
);

const responseHeaders = {};
let limiterPayload = null;
const limiterResponse = {
  locals: { traceId: "trace-rate-limit-test" },
  setHeader(name, value) { responseHeaders[name] = value; },
  status(code) {
    assert.equal(code, 429);
    return this;
  },
  json(payload) {
    limiterPayload = payload;
    return payload;
  }
};
createRateLimitHandler("auth-test", "Espera", 60_000)(
  {
    method: "POST",
    originalUrl: "/api/auth/login",
    rateLimit: { resetTime: new Date(Date.now() + 30_000) },
    traceId: "trace-rate-limit-test"
  },
  limiterResponse
);
assert.ok(Number(responseHeaders["Retry-After"]) >= 29);
assert.deepEqual(limiterPayload, {
  ok: false,
  message: "Espera",
  retryAfterSeconds: Number(responseHeaders["Retry-After"]),
  scope: "auth-test",
  traceId: "trace-rate-limit-test"
});

const appSource = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8");
const mediaLimiterIndex = appSource.indexOf('app.use("/api", mediaReadRateLimit);');
const generalLimiterIndex = appSource.indexOf('app.use("/api", generalApiRateLimit);');

assert.ok(mediaLimiterIndex >= 0, "Falta el rate limiter dedicado de multimedia");
assert.ok(generalLimiterIndex >= 0, "Falta el rate limiter general");
assert.ok(
  mediaLimiterIndex < generalLimiterIndex,
  "El limiter dedicado debe ejecutarse antes de la autoridad de perímetro API"
);

const chatRoutes = fs.readFileSync(
  path.resolve(__dirname, "../src/modules/chat/routes.js"),
  "utf8"
);
const chatMedia = fs.readFileSync(
  path.resolve(__dirname, "../src/services/chat-media.js"),
  "utf8"
);
const authRoutes = fs.readFileSync(
  path.resolve(__dirname, "../src/modules/auth/routes.js"),
  "utf8"
);
const enterpriseLimiter = fs.readFileSync(
  path.resolve(__dirname, "../src/middlewares/enterprise-rate-limit.js"),
  "utf8"
);
assert.ok(authRoutes.includes('scope: "auth"'));
assert.ok(authRoutes.includes('scope: "auth-refresh"'));
assert.ok(authRoutes.includes('scope: "auth-password-reset"'));
assert.ok(authRoutes.includes('router.post("/login", authLimiter'));
assert.ok(authRoutes.includes('router.post("/register", authLimiter'));
assert.ok(authRoutes.includes('router.post("/refresh", refreshLimiter'));
assert.ok(authRoutes.includes('router.post("/forgot-password", passwordResetLimiter'));
assert.ok(authRoutes.includes('router.post("/reset-password", authLimiter'));
assert.ok(enterpriseLimiter.includes("retryAfterSeconds"));
assert.ok(enterpriseLimiter.includes("traceId"));
assert.ok(enterpriseLimiter.includes("scope"));
assert.ok(
  chatRoutes.includes('router.get("/media/:storageKey", authenticate'),
  "Separar la cuota nunca debe volver publica la multimedia de chat"
);
assert.ok(
  chatRoutes.includes("canUserAccessChatMedia"),
  "La descarga debe conservar autorizacion por usuario/tenant"
);
assert.ok(
  chatMedia.includes('const { Readable } = require("stream");'),
  "La multimedia remota debe poder puentearse como stream del backend"
);
assert.ok(
  chatMedia.includes('ensureCloudinary();\n    return {\n      remoteUrl: cloudinary.url'),
  "La lectura Cloudinary debe configurar credenciales antes de firmar la URL"
);
assert.ok(
  chatMedia.includes('upstream = await fetch(remoteUrl'),
  "Cloudinary debe descargarse desde backend para no exponer un redirect cross-origin al navegador"
);
assert.ok(
  chatMedia.includes('Readable.fromWeb(upstream.body)'),
  "El backend debe transmitir la respuesta remota sin cargar el archivo completo en memoria"
);
assert.ok(
  !chatMedia.includes('res.redirect(baseAsset.redirectUrl)'),
  "La multimedia privada no debe depender de que el navegador siga un redirect a Cloudinary"
);

console.log("ok - anonymous, authenticated, auth and media traffic use bounded independent rate limit budgets");
