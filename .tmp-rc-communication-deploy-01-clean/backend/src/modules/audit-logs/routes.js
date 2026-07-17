const { Router } = require("express");
const { AuditLogModel } = require("../../data/models");
const { authenticate } = require("../../middlewares/authenticate");
const { canAccessAllTenants, getOrganizationId, requirePermission } = require("../../middlewares/access-control");

const router = Router();

router.get("/", authenticate, requirePermission("canViewAnalytics"), async (req, res) => {
  const hours = Math.max(1, Number(req.query.hours) || 168);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const organizationId = getOrganizationId(req.user);
  const query = {
    createdAt: { $gte: since }
  };

  if (!canAccessAllTenants(req.user)) {
    query.$or = [{ organizationId }, { actorId: req.user.id }];
  }

  const entries = await AuditLogModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();

  return res.json({
    ok: true,
    data: entries.map((entry) => ({
      id: entry._id,
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
});

module.exports = router;
