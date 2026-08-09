const { Router } = require("express");

const router = Router();

router.get("/info", async (req, res) => {
  const store = req.app.locals.store;
  const appConfig = store?.getAppConfig
    ? await Promise.resolve(store.getAppConfig())
    : null;

  if (appConfig) {
    return res.json({ ok: true, data: appConfig });
  }

  return res.json({
    ok: true,
    data: {
      name: "ManeComb",
      version: "1.0.2",
      status: "disponible",
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
          archived: false,
          mandatory: false,
        },
        {
          version: "1.0.1",
          date: "2026-07-15",
          current: false,
          size: "45 MB",
          androidMin: "8.0",
          notes: ["Nueva radio operativa", "Optimización de consumo de datos", "Correcciones generales de interfaz"],
          archived: false,
          mandatory: false,
        },
        {
          version: "1.0.0",
          date: "2026-07-10",
          current: false,
          size: "48 MB",
          androidMin: "8.0",
          notes: ["Primera versión pública", "Mapa en tiempo real", "Chat con la central", "Gestión de incidencias"],
          archived: false,
          mandatory: false,
        },
      ],
    },
  });
});

module.exports = router;
