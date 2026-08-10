const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  GENERAL_API_MAX,
  MEDIA_READ_MAX,
  createRateLimitHandler,
  isAuthApiRequest,
  isMediaReadRequest,
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
assert.equal(MEDIA_READ_MAX, 180);

assert.equal(isAuthApiRequest({ originalUrl: "/api/auth/login" }), true);
assert.equal(isAuthApiRequest({ originalUrl: "/api/auth/me?appVersion=1.3.0" }), true);
assert.equal(
  shouldSkipGeneralApiRateLimit({ method: "POST", originalUrl: "/api/auth/login", headers: {} }),
  true,
  "Auth must only consume its explicit route limiter"
);
assert.equal(
  shouldSkipGeneralApiRateLimit({
    method: "GET",
    originalUrl: "/api/locations/live",
    headers: { authorization: `Bearer ${operationalToken}` }
  }),
  true,
  "Authenticated operational traffic must not consume the anonymous perimeter bucket"
);
assert.equal(
  shouldSkipGeneralApiRateLimit({
    method: "GET",
    originalUrl: "/api/locations/live",
    headers: { authorization: "Bearer invalid-credential" }
  }),
  false,
  "Invalid Bearer text must not bypass the anonymous perimeter bucket"
);
assert.equal(
  shouldSkipGeneralApiRateLimit({ method: "GET", originalUrl: "/api/public-probe", headers: {} }),
  false,
  "Unauthenticated non-Auth traffic remains protected by the general limiter"
);

// A representative 15-minute session: one health probe every 30 seconds plus
// repeated operational reconciliations. Authenticated requests do not consume
// the anonymous budget, while health probes remain far below its fixed ceiling.
const healthProbes = 15 * 60 / 30;
const operationalRequests = Array.from({ length: 15 }, () => 12).flatMap((count) =>
  Array.from({ length: count }, () => ({
    method: "GET",
    originalUrl: "/api/locations/live",
    headers: { authorization: `Bearer ${operationalToken}` }
  }))
);
assert.ok(healthProbes < GENERAL_API_MAX);
assert.equal(operationalRequests.every(shouldSkipGeneralApiRateLimit), true);

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
  "El limiter dedicado debe ejecutarse antes de que el limiter general omita multimedia"
);

const chatRoutes = fs.readFileSync(
  path.resolve(__dirname, "../src/modules/chat/routes.js"),
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

console.log("ok - authenticated media reads use an independent rate limit budget");
