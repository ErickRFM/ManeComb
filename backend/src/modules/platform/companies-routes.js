const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth } = require("../../middlewares/platform-auth");
const { requirePlatformPermission } = require("../../middlewares/platform-access");
const { recordPlatformAction } = require("../../services/platform-audit");
const { serializePaginationMeta } = require("../../utils/platform-serializers");
const { listPlatformCompanies, getPlatformCompany } = require("./company-service");

const router = Router();

const companyReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo mas tarde." }
});

router.use(companyReadLimiter, platformAuth, requirePlatformPermission("platform.companies.read"));

router.get("/", async (req, res, next) => {
  try {
    const result = await listPlatformCompanies(req.app.locals.store, req.query || {});

    await recordPlatformAction(req, {
      action: "platform.company.list",
      severity: "info",
      metadata: {
        result: "success",
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        filters: result.filters
      }
    });

    return res.json({
      ok: true,
      data: result.items,
      pagination: serializePaginationMeta(result.pagination),
      filters: result.filters
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:organizationId", async (req, res, next) => {
  try {
    const company = await getPlatformCompany(req.app.locals.store, req.params.organizationId);

    await recordPlatformAction(req, {
      action: "platform.company.view",
      targetType: "organization",
      targetId: company.organizationId,
      severity: "info",
      metadata: {
        result: "success",
        affectedOrganizationId: company.organizationId
      }
    });

    return res.json({ ok: true, data: company });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
