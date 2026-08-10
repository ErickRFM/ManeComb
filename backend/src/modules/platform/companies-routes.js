const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth } = require("../../middlewares/platform-auth");
const { requirePlatformPermission } = require("../../middlewares/platform-access");
const { hasPlatformPermission } = require("../../config/platform-roles");
const { recordPlatformAction } = require("../../services/platform-audit");
const { serializePaginationMeta } = require("../../utils/platform-serializers");
const { listPlatformCompanies, getPlatformCompany } = require("./company-service");
const {
  sanitizeCompanyForViewer,
  sanitizeCompanyQuery
} = require("./company-visibility");

const router = Router();

const companyReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo mas tarde." }
});

router.use(companyReadLimiter, platformAuth, requirePlatformPermission("platform.companies.read"));

function canReadCommercial(req) {
  return hasPlatformPermission(req.platformUser?.role, "platform.commercial.read");
}

router.get("/", async (req, res, next) => {
  try {
    const commercialAccess = canReadCommercial(req);
    const result = await listPlatformCompanies(
      req.app.locals.store,
      sanitizeCompanyQuery(req.query || {}, commercialAccess)
    );

    await recordPlatformAction(req, {
      action: "platform.company.list",
      severity: "info",
      metadata: {
        result: "success",
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        filters: result.filters,
        commercialAccess
      }
    });

    return res.json({
      ok: true,
      data: result.items.map((company) => sanitizeCompanyForViewer(company, commercialAccess)),
      pagination: serializePaginationMeta(result.pagination),
      filters: result.filters
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:organizationId", async (req, res, next) => {
  try {
    const commercialAccess = canReadCommercial(req);
    const company = await getPlatformCompany(req.app.locals.store, req.params.organizationId);

    await recordPlatformAction(req, {
      action: "platform.company.view",
      targetType: "organization",
      targetId: company.organizationId,
      severity: "info",
      metadata: {
        result: "success",
        affectedOrganizationId: company.organizationId,
        commercialAccess
      }
    });

    return res.json({
      ok: true,
      data: sanitizeCompanyForViewer(company, commercialAccess)
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
