const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  getOrganizationId,
  requireOrganization,
  requirePermission
} = require("../../middlewares/access-control");

const router = Router();

router.get(
  "/",
  authenticate,
  requireOrganization,
  requirePermission("analytics.view"),
  async (req, res, next) => {
    try {
      const hours = Math.max(1, Number(req.query.hours) || 168);
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const entries = await req.app.locals.store.listAuditLogsForActor({
        organizationId: getOrganizationId(req.user),
        actorId: req.user.id,
        since,
        limit
      });

      return res.json({
        ok: true,
        data: entries.map((entry) => ({
          id: entry.id || entry._id,
          actorId: entry.actorId,
          organizationId: entry.organizationId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          ip: entry.ip,
          userAgent: entry.userAgent,
          severity: entry.severity,
          metadata: entry.metadata,
          createdAt: entry.createdAt
        }))
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;