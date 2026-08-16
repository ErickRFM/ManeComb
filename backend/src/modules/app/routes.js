const { Router } = require("express");

const router = Router();

router.get("/info", async (req, res, next) => {
  // La version publica cambia con cada release y no debe quedar congelada en
  // navegador, proxy ni CDN. La unica autoridad es AppConfig persistido.
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");

  try {
    const store = req.app.locals.store;
    const appConfig = store?.getAppConfig
      ? await Promise.resolve(store.getAppConfig())
      : null;

    if (!appConfig) {
      return res.status(503).json({
        ok: false,
        code: "app_release_not_configured",
        message: "La informacion publica de la aplicacion no esta configurada"
      });
    }

    return res.json({ ok: true, data: appConfig });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
