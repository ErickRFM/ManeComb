const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { requireAdmin } = require("../../middlewares/require-admin");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { getRtcIceConfig } = require("../../services/rtc-config");

const router = Router();

router.get("/config", authenticate, requireOperationalAccess, (req, res) => {
  return res.json({
    ok: true,
    data: getRtcIceConfig(req.user)
  });
});

router.get("/sessions", authenticate, requireOperationalAccess, requireAdmin, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.listRtcSessions({
      roomId: req.query.roomId,
      limit: req.query.limit
    })
  });
});

module.exports = router;
