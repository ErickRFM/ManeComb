const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth } = require("../../middlewares/platform-auth");
const { requirePlatformPermission } = require("../../middlewares/platform-access");
const { recordPlatformAction } = require("../../services/platform-audit");
const { serializePaginationMeta } = require("../../utils/platform-serializers");
const {
  listPlatformCommercialOrders,
  getPlatformCommercialOrder,
  getPlatformSystemReadiness,
  listPlatformAudit
} = require("./operations-service");

const router = Router();
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo mas tarde." }
});

router.get(
  "/commercial/orders",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.commercial.read"),
  async (req, res, next) => {
    try {
      const result = await listPlatformCommercialOrders(req.app.locals.store, req.query || {});
      await recordPlatformAction(req, {
        action: "platform.commercial.orders.list",
        severity: "info",
        metadata: {
          result: "success",
          page: result.pagination.page,
          limit: result.pagination.limit,
          total: result.pagination.total,
          filters: result.filters
        }
      });
      return res.json({
        ok: true,
        data: result.items,
        pagination: serializePaginationMeta(result.pagination),
        filters: result.filters
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/commercial/orders/:orderId",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.commercial.read"),
  async (req, res, next) => {
    try {
      const order = await getPlatformCommercialOrder(req.app.locals.store, req.params.orderId);
      await recordPlatformAction(req, {
        action: "platform.commercial.order.view",
        targetType: "commercial_order",
        targetId: order.id,
        severity: "info",
        metadata: {
          result: "success",
          affectedOrganizationId: order.organizationId
        }
      });
      return res.json({ ok: true, data: order });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/system/readiness",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.system.read"),
  async (req, res, next) => {
    try {
      const readiness = getPlatformSystemReadiness(req.app.locals.getDbState?.() || {});
      await recordPlatformAction(req, {
        action: "platform.system.readiness.read",
        severity: "info",
        metadata: { result: "success", status: readiness.status }
      });
      return res.json({ ok: true, data: readiness });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/audit",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.audit.read"),
  async (req, res, next) => {
    try {
      const result = await listPlatformAudit(req.query || {});
      await recordPlatformAction(req, {
        action: "platform.audit.list",
        severity: "info",
        metadata: {
          result: "success",
          page: result.pagination.page,
          limit: result.pagination.limit,
          total: result.pagination.total,
          filters: result.filters
        }
      });
      return res.json({
        ok: true,
        data: result.items,
        pagination: serializePaginationMeta(result.pagination),
        filters: result.filters,
        persistent: result.persistent
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
