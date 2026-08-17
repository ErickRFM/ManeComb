const { getRedisClient, getRedisReadiness } = require("../services/redis");
const { recordAuditLog } = require("../services/audit");
const logger = require("../services/logger");

const memoryBuckets = new Map();

function getClientKey(req, scope) {
  const ip = String(req.ip || "unknown").trim();
  const userId = req.user?.id || "anonymous";
  return `rate:${scope}:${userId}:${ip}`;
}

async function incrementRedis(key, windowMs) {
  const redis = getRedisClient();
  if (!redis) return null;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pExpire(key, windowMs);
  }
  const ttl = await redis.pTTL(key);
  return {
    count,
    resetInMs: ttl > 0 ? ttl : windowMs
  };
}

function incrementMemory(key, windowMs) {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return {
      count: 1,
      resetInMs: windowMs
    };
  }

  bucket.count += 1;
  return {
    count: bucket.count,
    resetInMs: bucket.resetAt - now
  };
}

async function incrementDistributed(key, windowMs, dependencies = {}) {
  const readiness = (dependencies.getRedisReadiness || getRedisReadiness)();

  // Memory is an explicit single-instance authority only when Redis is disabled.
  // Falling back per process while Redis is configured would split the counter
  // and let callers multiply the effective limit by the number of replicas.
  if (!readiness.enabled) {
    return (dependencies.incrementMemory || incrementMemory)(key, windowMs);
  }

  if (!readiness.ready) {
    const error = new Error("Rate limit distribuido temporalmente no disponible");
    error.code = "rate_limit_authority_unavailable";
    error.statusCode = 503;
    throw error;
  }

  const result = await (dependencies.incrementRedis || incrementRedis)(key, windowMs);
  if (!result) {
    const error = new Error("Rate limit distribuido temporalmente no disponible");
    error.code = "rate_limit_authority_unavailable";
    error.statusCode = 503;
    throw error;
  }
  return result;
}

function enterpriseRateLimit({
  scope,
  max = 60,
  windowMs = 60 * 1000,
  message = "Demasiadas solicitudes. Intenta de nuevo mas tarde."
}) {
  return async (req, res, next) => {
    const key = getClientKey(req, scope);
    let result;
    try {
      result = await incrementDistributed(key, windowMs);
    } catch (error) {
      logger.error({
        action: "RateLimitAuthorityUnavailable",
        module: "RateLimit",
        requestId: req?.traceId || res?.locals?.traceId || null,
        status: "503",
        error,
        metadata: { scope }
      });
      return res.status(503).json({
        ok: false,
        code: "rate_limit_authority_unavailable",
        message: "Proteccion de solicitudes temporalmente no disponible",
        traceId: req?.traceId || res?.locals?.traceId || null
      });
    }

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - result.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetInMs / 1000)));

    if (result.count <= max) {
      return next();
    }

    res.setHeader("Retry-After", String(Math.ceil(result.resetInMs / 1000)));
    const retryAfterSeconds = Math.ceil(result.resetInMs / 1000);
    const traceId = req?.traceId || res?.locals?.traceId || null;
    logger.warn({
      action: "RateLimitRejected",
      module: "RateLimit",
      requestId: traceId,
      status: "429",
      metadata: {
        retryAfterSeconds,
        scope
      }
    });
    await recordAuditLog(req, {
      action: "security.rate_limit_triggered",
      severity: "warning",
      targetType: "rate_limit",
      targetId: scope,
      metadata: {
        key,
        max,
        retryAfterSeconds,
        traceId,
        windowMs
      }
    });

    return res.status(429).json({
      ok: false,
      message,
      retryAfterSeconds,
      scope,
      traceId
    });
  };
}

module.exports = {
  enterpriseRateLimit,
  incrementDistributed
};
