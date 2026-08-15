const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  canAccessTenantResource,
  hasPermission
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const autoRouteConfig = require("../../config/auto-route");

const router = Router();

function itemsFromList(result) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.items) ? result.items : [];
}

async function guardRouteMutation(req, res, next) {
  try {
    if (!autoRouteConfig.segmentLearningEnabled) return next();
    if (!hasPermission(req.user, "canManageRoutes")) return next();

    const routeId = String(req.params.routeId || "").trim();
    if (!routeId) return next();
    const route = await req.app.locals.store.getRouteById(routeId);
    if (!route || !canAccessTenantResource(req.user, route)) return next();

    const [running, paused] = await Promise.all([
      req.app.locals.store.listRouteSessions({
        organizationId: route.organizationId,
        routeId,
        status: "RUNNING",
        limit: 1
      }),
      req.app.locals.store.listRouteSessions({
        organizationId: route.organizationId,
        routeId,
        status: "PAUSED",
        limit: 1
      })
    ]);

    if (!itemsFromList(running).length && !itemsFromList(paused).length) return next();

    return res.status(409).json({
      ok: false,
      code: "route_has_active_sessions",
      message: "Finaliza o cancela las jornadas activas antes de editar la ruta oficial"
    });
  } catch (error) {
    return next(error);
  }
}

router.patch("/routes/:routeId", authenticate, requireOperationalAccess, guardRouteMutation);
router.delete("/routes/:routeId", authenticate, requireOperationalAccess, guardRouteMutation);

module.exports = router;
