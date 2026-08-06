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
  JourneyAssignmentError,
  createJourneyAssignment
} = require("../../services/journey-assignment-service");
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

function respondJourneyError(res, error) {
  const statusByCode = {
    actor_required: 401,
    organization_required: 403,
    driver_mismatch: 403,
    driver_not_found: 404,
    vehicle_not_found: 404,
    route_not_found: 404,
    tenant_mismatch: 404,
    session_not_found: 404,
    session_id_required: 400,
    assignment_fields_required: 400,
    scheduled_start_invalid: 400,
    scheduled_end_invalid: 400,
    schedule_invalid: 400,
    invalid_status: 400,
    invalid_transition_time: 400,
    driver_unavailable: 409,
    vehicle_unavailable: 409,
    driver_vehicle_mismatch: 409,
    vehicle_route_mismatch: 409,
    schedule_conflict: 409,
    vehicle_active_journey: 409,
    assignment_transition_failed: 409,
    assignment_create_failed: 500,
    invalid_transition: 409,
    terminal_status: 409,
    concurrent_transition: 409
  };

  if (!(error instanceof JourneyTransitionError) && !(error instanceof JourneyAssignmentError)) {
    return false;
  }

  res.status(statusByCode[error.code] || 409).json({
    ok: false,
    code: error.code,
    message: error.message,
    details: error.details || undefined
  });
  return true;
}

router.post("/", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para asignar jornadas" });
    }

    const actor = actorFromRequest(req);
    if (!actor.organizationId) {
      return res.status(403).json({ ok: false, message: "Selecciona una organizacion para asignar la jornada" });
    }

    const result = await createJourneyAssignment({
      store: req.app.locals.store,
      actor,
      driverId: req.body.driverId,
      vehicleId: req.body.vehicleId,
      routeId: req.body.routeId,
      scheduledStartAt: req.body.scheduledStartAt,
      scheduledEndAt: req.body.scheduledEndAt,
      supervisorId: req.body.supervisorId,
      notes: req.body.notes
    });

    const session = serializeJourneySession(result.session);
    if (result.applied) emitJourneyUpdate(req, session);

    return res.status(result.applied ? 201 : 200).json({
      ok: true,
      applied: result.applied,
      idempotent: result.idempotent,
      data: session
    });
  } catch (error) {
    if (respondJourneyError(res, error)) return undefined;
    return next(error);
  }
});

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
    if (respondJourneyError(res, error)) return undefined;
    return next(error);
  }
});

module.exports = router;
