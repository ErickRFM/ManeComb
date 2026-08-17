const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { getOrganizationId, requireOrganization } = require("../../middlewares/access-control");
const { requireAdmin } = require("../../middlewares/require-admin");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { requireEnterpriseCapability } = require("../../middlewares/enterprise-capability-access");
const { ENTERPRISE_CAPABILITY } = require("../../services/enterprise-capabilities");
const { getRtcIceConfig } = require("../../services/rtc-config");

const router = Router();
const requireRtcAccess = requireEnterpriseCapability(ENTERPRISE_CAPABILITY.RTC_ACCESS);

router.get("/config", authenticate, requireOperationalAccess, requireRtcAccess, (req, res) => {
  return res.json({
    ok: true,
    data: getRtcIceConfig(req.user)
  });
});

router.get("/sessions", authenticate, requireOrganization, requireOperationalAccess, requireAdmin, requireRtcAccess, async (req, res) => {
  const organizationId = getOrganizationId(req.user);
  const requestedLimit = Math.max(1, Number(req.query.limit) || 20);
  const sessions = await req.app.locals.store.listRtcSessions({
    organizationId,
    roomId: req.query.roomId,
    // Production Mongo filters before limit. The larger compatibility window lets
    // the embedded/legacy store be filtered defensively below without exposing
    // cross-tenant sessions.
    limit: Math.max(requestedLimit, 5000)
  });
  const scopedSessions = (sessions || [])
    .filter((session) => String(session.organizationId || "").trim() === organizationId)
    .slice(0, requestedLimit);

  return res.json({
    ok: true,
    data: scopedSessions
  });
});

module.exports = router;