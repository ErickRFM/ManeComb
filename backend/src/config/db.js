const mongoose = require("mongoose");
const {
  MONGO_DB_NAME,
  MONGO_SERVER_SELECTION_TIMEOUT_MS,
  MONGO_URI,
  REQUIRE_MONGO
} = require("./env");

const dbState = {
  connected: false,
  mode: REQUIRE_MONGO ? "mongo_required" : "embedded",
  message: REQUIRE_MONGO ? "MongoDB es obligatorio para ejecutar la API" : "Motor interno activo"
};

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}

async function connectDB() {
  if (!MONGO_URI) {
    dbState.connected = false;
    dbState.mode = REQUIRE_MONGO ? "mongo_required" : "embedded";
    dbState.message = REQUIRE_MONGO
      ? "MONGO_URI no configurado y MongoDB es obligatorio."
      : "MONGO_URI no configurado. Se usara almacenamiento interno en memoria.";

    if (REQUIRE_MONGO) {
      throw new Error(dbState.message);
    }

    console.warn(`[db] ${dbState.message}`);
    return dbState;
  }

  try {
    const bootTimeoutMs = REQUIRE_MONGO
      ? MONGO_SERVER_SELECTION_TIMEOUT_MS
      : Math.min(MONGO_SERVER_SELECTION_TIMEOUT_MS, 3000);
    const connectionAttempt = mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME,
      family: 4,
      serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS
    });

    connectionAttempt.catch(() => undefined);

    await withTimeout(
      connectionAttempt,
      bootTimeoutMs,
      `Tiempo agotado conectando a MongoDB despues de ${bootTimeoutMs}ms`
    );

    dbState.connected = true;
    dbState.mode = "mongo";
    dbState.message = `MongoDB conectado (${MONGO_DB_NAME})`;
    console.log("[db] MongoDB conectado");
  } catch (error) {
    dbState.connected = false;
    dbState.mode = REQUIRE_MONGO ? "mongo_required" : "embedded";

    let detailedMessage = `No se pudo conectar a MongoDB: ${error.message}`;
    if (error.message.includes("whitelist")) {
      detailedMessage += "\n\n[TIP] Tu IP no esta en la lista blanca de MongoDB Atlas. ";
      detailedMessage += "\n1. Ve a https://cloud.mongodb.com";
      detailedMessage += "\n2. Network Access -> Add IP Address -> Add Current IP Address";
      detailedMessage += "\n3. O si es para pruebas, cambia REQUIRE_MONGO=false en backend/.env\n";
    }

    dbState.message = detailedMessage;

    if (REQUIRE_MONGO) {
      throw new Error(dbState.message);
    }

    console.warn(`[db] ${dbState.message}. Se mantiene el almacenamiento interno.`);
  }

  return dbState;
}

function getDbState() {
  return { ...dbState };
}

module.exports = {
  connectDB,
  getDbState
};
