const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const {
  canAccessAllTenants,
  getOrganizationId,
  getRolesWithPermission,
  hasPermission
} = require("../../middlewares/access-control");
const { ensureJourneySessionSchema } = require("../../domain/journey-session-schema");
const { serializeJourneySession } = require("../../domain/journey-session-compatibility");
const {
  JourneyTransitionError,
  transitionJourneySession
} = require("../../services/journey-transition-service");
const { recordSessionEvent } = require("../../services/route-event-engine");
const { calculateAndPersistRouteMetrics } = require("../../services/route-metrics-engine");
const { processCompletedRouteSession } = require("../../services/auto-route-learning");

ensureJourneySessionSchema();

const router = Router();

function resolveEventType(previousStatus, nextStatus) {
  if (previousStatus === "READY" && nextStatus === "RUNNING") return "SESSION_STARTED";
  if (previousStatus === "PAUSED" && nextStatus === "RUNNING") return "SESSION_RESUMED";
  if (nextStatus === "PAUSED") return "SESSION_PAUSED";
  if (nextStatus === "FINISHED" || nextStatus === "CANCELLED") return "SESSION_FINISHED";
  return null;
}

function emitJourneyUpdate(req, session) {
  const organizationId = String(session.organizationId || "").trim();
  getRolesWithPermission("canViewAnalytics").forEach((role) => {
    req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit("route-session:updated", session);
  });
  if (session.driverId) {
    req.app.locals.io?.to(`user:${session.driverId}`).emit("route-session:updated", session);
  }
  req.app.locals.io?.to("platform:admin").emit("route-session:updated", session);
}

function actorFromRequest(req) {
  return {
    id: req.user.id,
    role: req.user.role,
    organizationId: canAccessAllTenants(req.user) ? null : getOrganizationId(req.user)
  };
}

function respondTransitionError(res, error) {
  if (!(error instanceof JourneyTransitionError)) return false;

  const statusByCode = {
    actor_required: 401,
    driver_mismatch: 403,
    tenant_mismatch: 404,
    session_id_required: 400,
    session_not_found: 404,
    invalid_status: 400,
    invalid_transition_time: 400,
    invalid_transition: 409,
    terminal_status: 409,
    concurrent_transition: 409
  };

  res.status(statusByCode[error.code] || 409).json({
    ok: false,
    code: error.code,
    message: error.message,
    details: error.details || undefined
  });
  return true;
}

router.get("/:sessionId", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const session = await req.app.locals.store.getRouteSessionById(req.params.sessionId);
    if (!session) return res.status(404).json({ ok: false, message: "Jornada no encontrada" });

    const actor = actorFromRequest(req);
    if (req.user.role === "driver" && String(session.driverId) !== String(req.user.id)) {
      return res.status(404).json({ ok: false, message: "Jornada no encontrada" });
    }
    if (actor.organizationId && String(session.organizationId) !== String(actor.organizationId)) {
      return res.status(404).json({ ok: false, message: "Jornada no encontrada" });
    }

    return res.json({ ok: true, data: serializeJourneySession(session) });
  } catch (error) {
    return next(error);
  }
});

router.post("/:sessionId/transition", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para cambiar la jornada" });
    }

    const nextStatus = String(req.body.status || "").trim().toUpperCase();
    const result = await transitionJourneySession({
      store: req.app.locals.store,
      sessionId: req.params.sessionId,
      actor: actorFromRequest(req),
      nextStatus,
      finishReason: req.body.finishReason,
      finishedOdometer: req.body.finishedOdometer,
      endBattery: req.body.endBattery,
      endGpsAccuracy: req.body.endGpsAccuracy
    });

    let session = result.session;
    if (result.applied) {
      const eventType = resolveEventType(result.previousStatus, nextStatus);
      if (eventType) {
        await recordSessionEvent(req.app.locals.store, session, eventType, {
          previousStatus: result.previousStatus,
          nextStatus,
          updatedBy: req.user.id,
          finishReason: session.finishReason || null
        });
      }

      if (nextStatus === "FINISHED") {
        try {
          session = await calculateAndPersistRouteMetrics(req.app.locals.store, session.id);
        } catch {
          session = await req.app.locals.store.getRouteSessionById(session.id);
        }
        void processCompletedRouteSession(req.app.locals.store, session.id).catch(() => undefined);
      }

      emitJourneyUpdate(req, session);
    }

    return res.json({
      ok: true,
      applied: result.applied,
      idempotent: result.idempotent,
      data: serializeJourneySession(session)
    });
  } catch (error) {
    if (respondTransitionError(res, error)) return undefined;
    return next(error);
  }
});

module.exports = router;
