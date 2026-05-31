const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { filterTenantList, requireOrganization } = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");

const router = Router();

router.get("/", authenticate, requireOrganization, requireOperationalAccess, async (req, res) => {
  const live = await req.app.locals.store.getLiveLocations();

  return res.json({
    ok: true,
    data: filterTenantList(req.user, live.vehicles)
  });
});

module.exports = router;
