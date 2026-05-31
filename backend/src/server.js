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
const { initializeQueues } = require("./services/queue");
const { migrateLegacyLocalDocumentsToMongo } = require("./services/storage");
const { registerSocketServer } = require("./sockets");

async function startServer() {
  await connectDB();
  await connectRedis();
  await initializeQueues();

  const db = getDbState();
  const store = db.connected ? await createMongoStore() : createEmbeddedStore();

  if (REQUIRE_MONGO && !db.connected) {
    throw new Error("MongoDB es obligatorio y la API no pudo inicializar el store persistente");
  }

  if (db.connected) {
    const migration = await migrateLegacyLocalDocumentsToMongo();

    if (migration.enabled && migration.scanned) {
      console.log(
        `[storage] Migracion local->mongo completada. Migrados: ${migration.migrated}, fallidos: ${migration.failed}`
      );
    }
  }

  const app = createApp({
    store,
    getDbState
  });
  const server = http.createServer(app);
  const io = registerSocketServer(server, store);

  app.locals.io = io;

  server.listen(PORT, HOST, () => {
    const currentDb = getDbState();
    console.log(`[server] API Combis lista en http://${HOST}:${PORT} (${currentDb.mode})`);
  });
}

startServer().catch((error) => {
  console.error("[server] No fue posible iniciar la API", error);
  process.exit(1);
});
