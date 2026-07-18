const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  filterTenantList,
  getOrganizationId,
  requireOrganization
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { getOperationalUnit, listOperationalUnits } = require("../../services/operational-units-service");

const router = Router();

router.get("/", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    const data = await listOperationalUnits({
      store: req.app.locals.store,
      user: req.user,
      organizationId: getOrganizationId(req.user),
      filterTenantList
    });

    return res.json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
});

router.get("/:unitId", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    const data = await getOperationalUnit({
      store: req.app.locals.store,
      user: req.user,
      organizationId: getOrganizationId(req.user),
      filterTenantList,
      unitId: req.params.unitId
    });

    if (!data) {
      return res.status(404).json({ ok: false, message: "Unidad no encontrada" });
    }

    return res.json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
