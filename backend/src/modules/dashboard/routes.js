const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { requireOperationalAccess } = require("../../middlewares/operational-access");

const router = Router();

router.get("/overview", authenticate, requireOperationalAccess, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.getDashboardOverview(req.user)
  });
});

module.exports = router;
