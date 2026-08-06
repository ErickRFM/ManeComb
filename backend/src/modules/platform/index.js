const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth } = require("../../middlewares/platform-auth");
const { requirePlatformPermission } = require("../../middlewares/platform-access");
const { recordPlatformAction } = require("../../services/platform-audit");
const { getPlatformPermissions } = require("../../config/platform-roles");
const companiesRouter = require("./companies-routes");
const operationsRouter = require("./operations-routes");
const governanceRouter = require("./governance-routes");

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
    modules[name] = perms.some((permission) => permissions.includes(permission));
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

      await recordPlatformAction(req, {
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
      for (const user of users) {
        if (user.organizationId) orgIds.add(user.organizationId);
        const status = user.userStatus || user.status || "active";
        if (usersByStatus[status] !== undefined) usersByStatus[status] += 1;
        else usersByStatus.active += 1;
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
        for (const order of orders) {
          const raw = order.paymentStatus || order.status || "pending";
          if (raw === "paid" || raw === "active") ordersByStatus.active += 1;
          else if (raw === "completed" || raw === "expired") ordersByStatus.completed += 1;
          else if (raw === "cancelled" || raw === "refunded" || raw === "failed") ordersByStatus.cancelled += 1;
          else ordersByStatus.pending += 1;
        }
        overviewData.commercialOrders = { total: orders.length, byStatus: ordersByStatus };
      }

      await recordPlatformAction(req, {
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
router.use(governanceRouter);

module.exports = router;
