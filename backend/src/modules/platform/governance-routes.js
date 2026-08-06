const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth, requireMfa } = require("../../middlewares/platform-auth");
const { requirePlatformPermission, requirePlatformRole } = require("../../middlewares/platform-access");
const { recordPlatformAction } = require("../../services/platform-audit");
const { serializePaginationMeta } = require("../../utils/platform-serializers");
const {
  listGovernanceUsers,
  createGovernanceUser,
  listGovernanceSessions,
  executeGovernanceAction
} = require("./governance-service");

const router = Router();
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo más tarde." }
});
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas acciones administrativas. Intenta de nuevo más tarde." }
});

router.get(
  "/team",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.users.manage"),
  async (req, res, next) => {
    try {
      const result = await listGovernanceUsers(req.app.locals.store, req.query || {});
      await recordPlatformAction(req, {
        action: "platform.team.list",
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
  }
);

router.post(
  "/team",
  writeLimiter,
  platformAuth,
  requireMfa,
  requirePlatformPermission("platform.users.manage"),
  async (req, res, next) => {
    try {
      if (req.body?.role === "platform_owner" && req.platformUser.role !== "platform_owner") {
        return res.status(403).json({ ok: false, message: "Solo platform_owner puede crear otro owner" });
      }
      const user = await createGovernanceUser(req.app.locals.store, req.platformUser.id, req.body || {});
      await recordPlatformAction(req, {
        action: "platform.team.user.created",
        targetType: "platform_user",
        targetId: user.id,
        severity: "warning",
        metadata: { result: "success", role: user.role }
      });
      return res.status(201).json({ ok: true, data: user });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/sessions",
  readLimiter,
  platformAuth,
  requirePlatformPermission("platform.sessions.manage"),
  async (req, res, next) => {
    try {
      const result = await listGovernanceSessions(
        req.app.locals.store,
        req.query || {},
        req.platformSession?._id || req.platformSession?.id
      );
      await recordPlatformAction(req, {
        action: "platform.sessions.list",
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
  }
);

router.post(
  "/actions",
  writeLimiter,
  platformAuth,
  requireMfa,
  requirePlatformPermission("platform.actions.execute"),
  requirePlatformRole("platform_owner"),
  async (req, res, next) => {
    try {
      const result = await executeGovernanceAction(
        req.app.locals.store,
        req.platformUser,
        req.headers["idempotency-key"],
        req.body || {},
        req.platformSession?._id || req.platformSession?.id
      );
      await recordPlatformAction(req, {
        action: result.action,
        targetType: result.action.startsWith("platform.user") ? "platform_user" : "platform_session",
        targetId: req.body?.targetId || null,
        severity: "warning",
        metadata: {
          result: "success",
          reasonCode: "confirmed_governance_action",
          revokedCount: result.revokedCount || 0,
          replayed: Boolean(result.replayed)
        }
      });
      return res.json({ ok: true, data: result });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
