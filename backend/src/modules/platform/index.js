const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth } = require("../../middlewares/platform-auth");
const { requirePlatformPermission } = require("../../middlewares/platform-access");
const { recordPlatformAction } = require("../../services/platform-audit");
const { getPlatformPermissions } = require("../../config/platform-roles");
const companiesRouter = require("./companies-routes");
const operationsRouter = require("./operations-routes");

const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo mas tarde." }
});

const MODULE_PERMISSIONS = {
  users: ["platform.users.manage"],
  sessions: ["platform.sessions.manage"],
  companies: ["platform.companies.read"],
  commercial: ["platform.commercial.read"],
  system: ["platform.system.read"],
  audit: ["platform.audit.read"],
  actions: ["platform.actions.execute"]
};

function deriveModules(permissions) {
  const modules = {};
  for (const [name, perms] of Object.entries(MODULE_PERMISSIONS)) {
    modules[name] = perms.some((p) => permissions.includes(p));
  }
  return modules;
}

const router = Router();

router.get(
  "/capabilities",
  readLimiter,
  platformAuth,
  async (req, res, next) => {
    try {
      const permissions = getPlatformPermissions(req.platformUser.role);
      const modules = deriveModules(permissions);
      const data = {
        user: req.platformUser,
        permissions,
        modules
      };

      recordPlatformAction(req, {
        action: "platform.capabilities.read",
        severity: "info",
        metadata: { role: req.platformUser.role }
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
  requirePlatformPermission("platform.companies.read"),
  async (req, res, next) => {
    try {
      const store = req.app.locals.store;
      const permissions = getPlatformPermissions(req.platformUser.role);

      const users = await store.listUsers(null);
      const vehicleCounts = await store.countVehiclesByStatus();

      const orgIds = new Set();
      const usersByStatus = { active: 0, pending: 0, suspended: 0 };
      for (const u of users) {
        if (u.organizationId) orgIds.add(u.organizationId);
        const status = u.userStatus || u.status || "active";
        if (usersByStatus[status] !== undefined) usersByStatus[status]++;
        else usersByStatus.active++;
      }

      const overviewData = {
        generatedAt: new Date().toISOString(),
        companies: { total: orgIds.size },
        users: { total: users.length, byStatus: usersByStatus },
        vehicles: {
          total: vehicleCounts.total,
          byStatus: {
            on_route: vehicleCounts.on_route,
            maintenance: vehicleCounts.maintenance,
            idle: vehicleCounts.idle
          }
        }
      };

      if (permissions.includes("platform.commercial.read")) {
        const orders = typeof store.listCommercialOrders === "function"
          ? await store.listCommercialOrders()
          : [];
        const ordersByStatus = { pending: 0, active: 0, completed: 0, cancelled: 0 };
        for (const o of orders) {
          const raw = o.paymentStatus || o.status || "pending";
          if (raw === "paid" || raw === "active") ordersByStatus.active++;
          else if (raw === "completed" || raw === "expired") ordersByStatus.completed++;
          else if (raw === "cancelled" || raw === "refunded" || raw === "failed") ordersByStatus.cancelled++;
          else ordersByStatus.pending++;
        }
        overviewData.commercialOrders = { total: orders.length, byStatus: ordersByStatus };
      }

      recordPlatformAction(req, {
        action: "platform.overview.read",
        severity: "info",
        metadata: {
          companies: overviewData.companies.total,
          users: overviewData.users.total,
          vehicles: overviewData.vehicles.total,
          ...(overviewData.commercialOrders ? { orders: overviewData.commercialOrders.total } : {})
        }
      });

      return res.json({ ok: true, data: overviewData });
    } catch (error) {
      return next(error);
    }
  }
);

router.use("/companies", companiesRouter);
router.use(operationsRouter);

module.exports = router;
