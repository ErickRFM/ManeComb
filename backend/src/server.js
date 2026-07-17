const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});
const http = require("http");
const createApp = require("./app");
const { connectDB, getDbState } = require("./config/db");
const { HOST, PORT, REQUIRE_MONGO } = require("./config/env");
const { createEmbeddedStore, createMongoStore } = require("./data/store");
const { connectRedis } = require("./services/redis");
const communication = require("../modules/communication");
const { logMercadoPagoRuntimeDiagnostics } = require("./services/commercial-payment");
const { migrateLegacyLocalDocumentsToMongo } = require("./services/storage");
const { registerSocketServer } = require("./sockets");
const logger = require("./services/logger");

async function startServer() {
  await connectDB();
  await connectRedis();
  communication.configure({
    provider: "resend",
    providerConfig: {
      apiKey: process.env.RESEND_API_KEY || "",
      fromEmail: process.env.RESEND_FROM_EMAIL || "",
      replyTo: process.env.RESEND_REPLY_TO || ""
    },
    queue: {
      enabled: /^(1|true|yes|on)$/i.test(String(process.env.ENABLE_QUEUES || "")) && Boolean(process.env.REDIS_URL),
      redisUrl: process.env.REDIS_URL || ""
    },
    defaultFrom: process.env.RESEND_FROM_EMAIL || "",
    supportEmail: process.env.COMMERCIAL_SUPPORT_EMAIL || "",
    docsUrl: "",
    brandName: process.env.COMMERCIAL_BRAND_NAME || "ManeComb",
    legalName: process.env.COMMERCIAL_LEGAL_NAME || "ManeComb"
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
