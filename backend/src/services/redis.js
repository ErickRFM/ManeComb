const { ENABLE_REDIS, REDIS_URL } = require("../config/env");

let redisClient = null;
let redisStatus = {
  enabled: ENABLE_REDIS,
  ready: false,
  mode: ENABLE_REDIS ? "configured" : "disabled",
  message: ENABLE_REDIS ? "Redis pendiente de conexion" : "Redis deshabilitado"
};

async function connectRedis() {
  if (!ENABLE_REDIS || !REDIS_URL) {
    redisStatus = {
      enabled: ENABLE_REDIS,
      ready: false,
      mode: ENABLE_REDIS ? "missing_config" : "disabled",
      message: ENABLE_REDIS ? "REDIS_URL no configurado" : "Redis deshabilitado"
    };
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    const { createClient } = require("redis");
    redisClient = createClient({
      url: REDIS_URL
    });
    redisClient.on("error", (error) => {
      redisStatus = {
        enabled: true,
        ready: false,
        mode: "error",
        message: error.message
      };
    });
    await redisClient.connect();
    redisStatus = {
      enabled: true,
      ready: true,
      mode: "redis",
      message: "Redis conectado"
    };
    return redisClient;
  } catch (error) {
    redisClient = null;
    redisStatus = {
      enabled: true,
      ready: false,
      mode: "unavailable",
      message: error.message || "Redis no disponible"
    };
    return null;
  }
}

function getRedisClient() {
  return redisClient;
}

function getRedisReadiness() {
  return { ...redisStatus };
}

module.exports = {
  connectRedis,
  getRedisClient,
  getRedisReadiness
};
