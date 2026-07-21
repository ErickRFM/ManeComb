const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { requireAdmin } = require("../../middlewares/require-admin");
const { recordAuditLog } = require("../../services/audit");
const { wrapErrors } = require("../../middlewares/error-handler");

const router = Router();

router.get("/info", async (req, res) => {
  const store = req.app.locals.store;
  const appConfig = store?.getAppConfig ? store.getAppConfig() : null;

  if (appConfig) {
    return res.json({ ok: true, data: appConfig });
  }

  return res.json({
    ok: true,
    data: {
      name: "ManeComb",
      version: "1.0.2",
      apkUrl: "https://1drv.ms/u/s!Aq6TgxRWNbScgQah2wPwI8wZGn3L?e=JCh8cX",
      androidMin: "8.0",
      size: "42 MB",
      releaseDate: "2026-07-20",
      releaseNotes: ["GPS optimizado", "Mejoras de estabilidad", "Corrección de incidencias"],
      versionHistory: [
        {
          version: "1.0.2",
          date: "2026-07-20",
          current: true,
          size: "42 MB",
          androidMin: "8.0",
          notes: ["GPS optimizado", "Mejoras de estabilidad", "Corrección de incidencias"],
        },
        {
          version: "1.0.1",
          date: "2026-07-15",
          current: false,
          size: "45 MB",
          androidMin: "8.0",
          notes: ["Nueva radio operativa", "Optimización de consumo de datos", "Correcciones generales de interfaz"],
        },
        {
          version: "1.0.0",
          date: "2026-07-10",
          current: false,
          size: "48 MB",
          androidMin: "8.0",
          notes: ["Primera versión pública", "Mapa en tiempo real", "Chat con la central", "Gestión de incidencias"],
        },
      ],
    },
  });
});

router.patch("/info", authenticate, wrapErrors(async (req, res) => {
  const store = req.app.locals.store;
  if (!store?.updateAppConfig) {
    return res.status(503).json({ ok: false, message: "Store no disponible" });
  }

  requireAdmin(req, res, async () => {
    const { name, version, status, apkUrl, androidMin, size, releaseDate, releaseNotes, versionHistory } = req.body;

    if (version !== undefined && typeof version !== "string") {
      return res.status(400).json({ ok: false, message: "version debe ser un texto" });
    }
    if (releaseNotes !== undefined && !Array.isArray(releaseNotes)) {
      return res.status(400).json({ ok: false, message: "releaseNotes debe ser un arreglo" });
    }
    if (versionHistory !== undefined && !Array.isArray(versionHistory)) {
      return res.status(400).json({ ok: false, message: "versionHistory debe ser un arreglo" });
    }

    const updated = store.updateAppConfig({
      name,
      version,
      status,
      apkUrl,
      androidMin,
      size,
      releaseDate,
      releaseNotes,
      versionHistory,
    });

    await recordAuditLog(req, {
      action: "app.info.update",
      targetType: "app",
      targetId: "app-config",
      severity: "info",
      metadata: { fields: Object.keys(req.body) },
      message: "Configuración de la aplicación actualizada",
    });

    return res.json({ ok: true, data: updated });
  });
}));

module.exports = router;
