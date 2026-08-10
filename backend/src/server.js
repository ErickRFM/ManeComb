const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});
const http = require("http");
const mongoose = require("mongoose");
const createApp = require("./app");
const { connectDB, getDbState } = require("./config/db");
const {
  HOST, PORT, REQUIRE_MONGO, RESEND_API_KEY, RESEND_REPLY_TO,
  EMAIL_ENABLED, EMAIL_DRY_RUN, EMAIL_FROM, EMAIL_FROM_NAME,
  PORTAL_PUBLIC_URL, REDIS_PERSISTENCE_ENABLED, REDIS_MAXMEMORY_POLICY
} = require("./config/env");
const { assertPlatformSecurityConfiguration } = require("./config/platform-security");
const { assertPlatformAccessConfiguration } = require("./config/platform-access");
const { createEmbeddedStore, createMongoStore } = require("./data/store");
const { connectRedis } = require("./services/redis");
const communication = require("../modules/communication");
const { logMercadoPagoRuntimeDiagnostics } = require("./services/commercial-payment");
const { startOperationalFreshnessSweeper } = require("./services/operational-freshness-sweeper");
const { migrateLegacyLocalDocumentsToMongo } = require("./services/storage");
const { registerSocketServer } = require("./sockets");
const logger = require("./services/logger");

async function startServer() {
  const platformSecurity = assertPlatformSecurityConfiguration();
  logger.info({
    action: "PlatformSecurityConfiguration",
    metadata: platformSecurity,
    module: "Platform",
    status: platformSecurity.ready ? "ready" : platformSecurity.configured ? "degraded" : "disabled"
  });

  const platformAccessSecurity = assertPlatformAccessConfiguration();
  logger.info({
    action: "PlatformAccessConfiguration",
    metadata: {
      enabled: platformAccessSecurity.enabled,
      issuerConfigured: Boolean(platformAccessSecurity.issuer),
      audienceConfigured: Boolean(platformAccessSecurity.audience),
      jwksConfigured: Boolean(platformAccessSecurity.jwksUrl)
    },
    module: "Platform",
    status: platformAccessSecurity.enabled ? "ready" : "disabled"
  });

  await connectDB();
  await connectRedis();
  communication.configure({
    provider: "resend",
    providerConfig: {
      apiKey: RESEND_API_KEY,
      fromEmail: EMAIL_FROM,
      replyTo: RESEND_REPLY_TO
    },
    queue: {
      enabled: /^(1|true|yes|on)$/i.test(String(process.env.ENABLE_QUEUES || "")) && Boolean(process.env.REDIS_URL),
      redisUrl: process.env.REDIS_URL || "",
      persistence: REDIS_PERSISTENCE_ENABLED,
      maxmemoryPolicy: REDIS_MAXMEMORY_POLICY
    },
    defaultFrom: EMAIL_FROM ? `${EMAIL_FROM_NAME} <${EMAIL_FROM}>` : "",
    supportEmail: process.env.COMMERCIAL_SUPPORT_EMAIL || "",
    docsUrl: PORTAL_PUBLIC_URL,
    brandName: EMAIL_FROM_NAME,
    legalName: process.env.COMMERCIAL_LEGAL_NAME || "ManeComb",
    email: {
      enabled: EMAIL_ENABLED,
      dryRun: EMAIL_DRY_RUN,
      requireDurableQueue: /^(1|true|yes|on)$/i.test(String(process.env.ENABLE_QUEUES || "")),
      requireDurableHistory: true
    },
    persistence: { mongoose }
  });
  await communication.initializePersistence();
  logger.info({
    action: "RuntimeDiagnostics",
    metadata: communication.getRuntimeDiagnostics(),
    module: "Communication",
    status: communication.getReadiness().status
  });

  const db = getDbState();
  const store = db.connected ? await createMongoStore() : createEmbeddedStore();

  if (REQUIRE_MONGO && !db.connected) {
    throw new Error("MongoDB es obligatorio y la API no pudo inicializar el store persistente");
  }

  if (db.connected) {
    const migration = await migrateLegacyLocalDocumentsToMongo();

    if (migration.enabled && migration.scanned) {
      logger.info({
        action: "LegacyDocumentMigration",
        metadata: migration,
        module: "Storage",
        status: migration.failed ? "partial" : "success"
      });
    }
  }

  logMercadoPagoRuntimeDiagnostics();

  const app = createApp({
    store,
    getDbState
  });
  const server = http.createServer(app);
  const io = registerSocketServer(server, store);

  app.locals.io = io;
  startOperationalFreshnessSweeper({ io, store, server });

  server.listen(PORT, HOST, () => {
    const currentDb = getDbState();
    logger.info({
      action: "Listen",
      message: `API Combis lista en http://${HOST}:${PORT}`,
      metadata: {
        dbMode: currentDb.mode,
        host: HOST,
        port: PORT
      },
      module: "Server",
      status: "ready"
    });
  });
}

startServer().catch((error) => {
  logger.error({
    action: "Start",
    error,
    message: "No fue posible iniciar la API",
    module: "Server",
    status: "failed"
  });
  process.exit(1);
});
