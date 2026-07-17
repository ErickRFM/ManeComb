const { getRedisClient } = require("../services/redis");
const { recordAuditLog } = require("../services/audit");

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

function enterpriseRateLimit({
  scope,
  max = 60,
  windowMs = 60 * 1000,
  message = "Demasiadas solicitudes. Intenta de nuevo mas tarde."
}) {
  return async (req, res, next) => {
    const key = getClientKey(req, scope);
    const result = (await incrementRedis(key, windowMs).catch(() => null)) || incrementMemory(key, windowMs);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - result.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetInMs / 1000)));

    if (result.count <= max) {
      return next();
    }

    res.setHeader("Retry-After", String(Math.ceil(result.resetInMs / 1000)));
    await recordAuditLog(req, {
      action: "security.rate_limit_triggered",
      severity: "warning",
      targetType: "rate_limit",
      targetId: scope,
      metadata: {
        key,
        max,
        windowMs
      }
    });

    return res.status(429).json({
      ok: false,
      message,
      retryAfterSeconds: Math.ceil(result.resetInMs / 1000)
    });
  };
}

module.exports = {
  enterpriseRateLimit
};
