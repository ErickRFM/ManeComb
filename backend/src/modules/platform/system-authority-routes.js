const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth } = require("../../middlewares/platform-auth");
const { requirePlatformPermission } = require("../../middlewares/platform-access");
const { recordPlatformAction } = require("../../services/platform-audit");
const { sanitizeText } = require("../../utils/platform-filters");

const router = Router();
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo mas tarde." }
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo mas tarde." }
});

const APP_CONFIG_STRING_FIELDS = {
  name: 80,
  version: 40,
  status: 40,
  apkUrl: 2048,
  androidMin: 40,
  size: 40,
  releaseDate: 40
};
const APP_CONFIG_FIELDS = new Set([
  ...Object.keys(APP_CONFIG_STRING_FIELDS),
  "releaseNotes",
  "versionHistory"
]);

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeOperationalEvent(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const rawId = source.id ?? source._id;
  return {
    id: rawId == null ? null : sanitizeText(String(rawId), 128) || null,
    type: sanitizeText(source.type, 80) || null,
    scope: sanitizeText(source.scope, 80) || null,
    level: sanitizeText(source.level, 32) || null,
    status: sanitizeText(source.status, 32) || null,
    route: sanitizeText(source.route, 180) || null,
    method: sanitizeText(source.method, 16) || null,
    durationMs: Math.max(0, safeNumber(source.durationMs)),
    createdAt: safeIso(source.createdAt)
  };
}

function serializeOperationalInsights(insights = {}) {
  const rtc = insights.rtc && typeof insights.rtc === "object" ? insights.rtc : {};
  return {
    windowHours: Math.max(1, safeNumber(insights.windowHours) || 24),
    apiErrors: Math.max(0, safeNumber(insights.apiErrors)),
    slowRequests: Math.max(0, safeNumber(insights.slowRequests)),
    pushDelivered: Math.max(0, safeNumber(insights.pushDelivered)),
    pushFailed: Math.max(0, safeNumber(insights.pushFailed)),
    checkoutEvents: Math.max(0, safeNumber(insights.checkoutEvents)),
    activeCriticalIncidents: Math.max(0, safeNumber(insights.activeCriticalIncidents)),
    rtc: {
      recentSessions: Math.max(0, safeNumber(rtc.recentSessions)),
      completedSessions: Math.max(0, safeNumber(rtc.completedSessions)),
      averageDurationSeconds: Math.max(0, safeNumber(rtc.averageDurationSeconds))
    },
    recentEvents: Array.isArray(insights.recentEvents)
      ? insights.recentEvents.slice(0, 25).map(serializeOperationalEvent)
      : []
  };
}

function serializeDeviceVersionStats(stats = {}) {
  const versions = {};
  const sourceVersions = stats.versions && typeof stats.versions === "object" ? stats.versions : {};
  for (const [rawVersion, rawCount] of Object.entries(sourceVersions).slice(0, 50)) {
    const version = sanitizeText(rawVersion, 40);
    if (version) versions[version] = Math.max(0, safeNumber(rawCount));
  }

  return {
    total: Math.max(0, safeNumber(stats.total)),
    versions,
    mostUsedVersion: sanitizeText(stats.mostUsedVersion, 40) || null,
    lastPublication: safeIso(stats.lastPublication) || sanitizeText(stats.lastPublication, 40) || null
  };
}

function sanitizeNotes(value) {
  if (!Array.isArray(value)) return null;
  return value
    .slice(0, 20)
    .map((entry) => sanitizeText(entry, 240))
    .filter(Boolean);
}

function sanitizeVersionHistory(value) {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 50).map((entry) => {
    const source = entry && typeof entry === "object" ? entry : {};
    return {
      version: sanitizeText(source.version, 40),
      date: sanitizeText(source.date, 40),
      current: Boolean(source.current),
      size: sanitizeText(source.size, 40),
      androidMin: sanitizeText(source.androidMin, 40),
      notes: sanitizeNotes(source.notes) || [],
      archived: Boolean(source.archived),
      mandatory: Boolean(source.mandatory)
    };
  });
}

function buildAppConfigPatch(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "El cuerpo debe ser un objeto JSON" };
  }

  const unknownFields = Object.keys(body).filter((key) => !APP_CONFIG_FIELDS.has(key));
  if (unknownFields.length) {
    return { error: `Campos no permitidos: ${unknownFields.join(", ")}` };
  }

  const patch = {};
  for (const [field, maxLength] of Object.entries(APP_CONFIG_STRING_FIELDS)) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string") {
      return { error: `${field} debe ser un texto` };
    }
    patch[field] = sanitizeText(body[field], maxLength);
  }

  if (patch.apkUrl) {
    try {
      const parsed = new URL(patch.apkUrl);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
        return { error: "apkUrl debe ser una URL http/https sin credenciales" };
      }
      patch.apkUrl = parsed.toString();
    } catch {
      return { error: "apkUrl debe ser una URL válida" };
    }
  }

  if (body.releaseNotes !== undefined) {
    const releaseNotes = sanitizeNotes(body.releaseNotes);
    if (!releaseNotes) return { error: "releaseNotes debe ser un arreglo" };
    patch.releaseNotes = releaseNotes;
  }

  if (body.versionHistory !== undefined) {
    const versionHistory = sanitizeVersionHistory(body.versionHistory);
    if (!versionHistory) return { error: "versionHistory debe ser un arreglo" };
    patch.versionHistory = versionHistory;
  }

  if (!Object.keys(patch).length) {
    return { error: "No hay campos de configuración para actualizar" };
  }

  return { patch };
}

router.get(
  "/system/observability",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.system.read"),
  async (req, res, next) => {
    try {
      const store = req.app.locals.store;
      if (!store?.getOperationalInsights) {
        return res.status(503).json({ ok: false, message: "Telemetría no disponible" });
      }
      const insights = await store.getOperationalInsights({
        hours: req.query.hours,
        limit: req.query.limit
      });
      const data = serializeOperationalInsights(insights);
      await recordPlatformAction(req, {
        action: "platform.system.observability.read",
        severity: "info",
        metadata: { result: "success", windowHours: data.windowHours }
      });
      return res.json({ ok: true, data });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/system/app/device-stats",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.system.read"),
  async (req, res, next) => {
    try {
      const store = req.app.locals.store;
      const stats = store?.getDeviceVersionStats ? await Promise.resolve(store.getDeviceVersionStats()) : {};
      const data = serializeDeviceVersionStats(stats);
      await recordPlatformAction(req, {
        action: "platform.system.app.device_stats.read",
        severity: "info",
        metadata: { result: "success", total: data.total }
      });
      return res.json({ ok: true, data });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/system/app/info",
  writeLimiter,
  platformAuth,
  requirePlatformPermission("platform.actions.execute"),
  async (req, res, next) => {
    try {
      const store = req.app.locals.store;
      if (!store?.updateAppConfig) {
        return res.status(503).json({ ok: false, message: "Configuración de app no disponible" });
      }

      const { patch, error } = buildAppConfigPatch(req.body);
      if (error) {
        return res.status(400).json({ ok: false, code: "invalid_app_config", message: error });
      }

      const updated = await Promise.resolve(store.updateAppConfig(patch));
      await recordPlatformAction(req, {
        action: "platform.system.app.info.update",
        targetType: "app",
        targetId: "app-config",
        severity: "warning",
        metadata: {
          result: "success",
          fieldCount: Object.keys(patch).length
        }
      });
      return res.json({ ok: true, data: updated });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = {
  router,
  serializeOperationalEvent,
  serializeOperationalInsights,
  serializeDeviceVersionStats,
  buildAppConfigPatch
};
