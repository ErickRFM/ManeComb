const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth, requireMfa } = require("../../middlewares/platform-auth");
const { requirePlatformPermission } = require("../../middlewares/platform-access");
const { recordPlatformAction } = require("../../services/platform-audit");
const { serializeCapabilities, serializeOverview } = require("../../utils/platform-serializers");

const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo más tarde." }
});

const router = Router();

router.get(
  "/capabilities",
  readLimiter,
  platformAuth,
  requireMfa,
  requirePlatformPermission("platform.system.read"),
  async (req, res, next) => {
    try {
      const userRole = req.platformUser.role;
      const data = serializeCapabilities(userRole);

      recordPlatformAction(req, {
        action: "platform.capabilities.read",
        severity: "info",
        metadata: { role: userRole }
      });

      return res.json({ ok: true, data });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/overview",
  readLimiter,
  platformAuth,
  requireMfa,
  requirePlatformPermission("platform.system.read"),
  async (req, res, next) => {
    try {
      const store = req.app.locals.store;
      const users = await store.listUsers(null);
      const vehicleCounts = await store.countVehiclesByStatus();
      const orders = typeof store.listCommercialOrders === "function"
        ? await store.listCommercialOrders()
        : [];

      const orgIds = new Set();
      const usersByStatus = { active: 0, pending: 0, suspended: 0 };
      for (const u of users) {
        if (u.organizationId) orgIds.add(u.organizationId);
        const status = u.userStatus || u.status || "active";
        if (usersByStatus[status] !== undefined) usersByStatus[status]++;
        else usersByStatus.active++;
      }

      const ordersByStatus = { pending: 0, active: 0, completed: 0, cancelled: 0 };
      for (const o of orders) {
        const raw = o.paymentStatus || o.status || "pending";
        if (raw === "paid" || raw === "active") ordersByStatus.active++;
        else if (raw === "completed" || raw === "expired") ordersByStatus.completed++;
        else if (raw === "cancelled" || raw === "refunded" || raw === "failed") ordersByStatus.cancelled++;
        else ordersByStatus.pending++;
      }

      const overviewData = {
        companies: { total: orgIds.size },
        users: { total: users.length, byStatus: usersByStatus },
        vehicles: { total: vehicleCounts.total, byStatus: { on_route: vehicleCounts.on_route, maintenance: vehicleCounts.maintenance, idle: vehicleCounts.idle } },
        commercialOrders: { total: orders.length, byStatus: ordersByStatus }
      };

      const data = serializeOverview(overviewData);

      recordPlatformAction(req, {
        action: "platform.overview.read",
        severity: "info",
        metadata: {
          companies: overviewData.companies.total,
          users: overviewData.users.total,
          vehicles: overviewData.vehicles.total,
          orders: overviewData.commercialOrders.total
        }
      });

      return res.json({ ok: true, data });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
