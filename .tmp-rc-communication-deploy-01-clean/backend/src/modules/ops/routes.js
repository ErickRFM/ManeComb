const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { requireAdmin } = require("../../middlewares/require-admin");

const router = Router();

router.get("/observability", authenticate, requireAdmin, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.getOperationalInsights({
      hours: req.query.hours,
      limit: req.query.limit
    })
  });
});

module.exports = router;
