const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  GENERAL_API_MAX,
  MEDIA_READ_MAX,
  isMediaReadRequest
} = require("../src/middlewares/api-rate-limit");

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
assert.ok(
  chatRoutes.includes('router.get("/media/:storageKey", authenticate'),
  "Separar la cuota nunca debe volver publica la multimedia de chat"
);
assert.ok(
  chatRoutes.includes("canUserAccessChatMedia"),
  "La descarga debe conservar autorizacion por usuario/tenant"
);

console.log("ok - authenticated media reads use an independent rate limit budget");
