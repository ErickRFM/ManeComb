const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  canAccessAllTenants,
  getOrganizationId,
  getRolesWithPermission,
  hasPermission,
  requireOrganization
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const autoRouteConfig = require("../../config/auto-route");
const {
  decodeSegmentGeometryVersion,
  isSegmentCandidate
} = require("../../domain/learned-route-segment");
const {
  polylineLengthMeters,
  slicePolyline
} = require("../../domain/route-geometry");
const { applySegmentCandidateToRoute } = require("../../services/route-segment-approval");
const { recordAuditLog } = require("../../services/audit");

const router = Router();

function requireReviewEnabled(res) {
  if (autoRouteConfig.reviewEnabled) return true;
  res.status(503).json({
    ok: false,
    code: "auto_route_review_disabled",
    message: "La revisión de rutas sugeridas no está habilitada"
  });
  return false;
}

function canReview(req) {
  return hasPermission(req.user, "canManageRoutes");
}

function canAccessCandidate(req, candidate) {
  return candidate && (
    canAccessAllTenants(req.user) ||
    String(candidate.organizationId || "") === String(getOrganizationId(req.user) || "")
  );
}

function emitRouteAudience(req, organizationId, eventName, payload, driverId = null) {
  getRolesWithPermission("canViewAnalytics").forEach((role) => {
    req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit(eventName, payload);
  });
  if (driverId) req.app.locals.io?.to(`user:${driverId}`).emit(eventName, payload);
  req.app.locals.io?.to("platform:admin").emit(eventName, payload);
}

function itemsFromList(result) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.items) ? result.items : [];
}

async function buildSegmentReview(store, candidate) {
  const metadata = decodeSegmentGeometryVersion(candidate.geometryVersion);
  if (!metadata) return null;
  const route = await store.getRouteById(metadata.routeId);
  const stale = !route || Number(route.revision) !== metadata.routeRevision;
  const routePolyline = Array.isArray(route?.polyline) ? route.polyline : [];
  const baselinePolyline = routePolyline.length >= 2
    ? slicePolyline(routePolyline, metadata.startDistanceMeters, metadata.endDistanceMeters)
    : [];
  const baselineDistanceMeters = Math.round(polylineLengthMeters(baselinePolyline));
  const routeGeometryDistance = polylineLengthMeters(routePolyline);
  const baselineDurationSeconds = routeGeometryDistance > 0
    ? Math.round((Number(route?.durationSeconds) || 0) * baselineDistanceMeters / routeGeometryDistance)
    : 0;
  return {
    ...candidate,
    segment: {
      routeId: metadata.routeId,
      baseRouteRevision: metadata.routeRevision,
      currentRouteRevision: route ? Number(route.revision) || 0 : null,
      routeName: route?.name || "Ruta no disponible",
      startDistanceMeters: metadata.startDistanceMeters,
      endDistanceMeters: metadata.endDistanceMeters,
      baselinePolyline,
      baselineDistanceMeters,
      baselineDurationSeconds,
      distanceDeltaMeters: Math.round((Number(candidate.distanceMeters) || 0) - baselineDistanceMeters),
      durationDeltaSeconds: Math.round((Number(candidate.durationSeconds) || 0) - baselineDurationSeconds),
      stale
    }
  };
}

router.get(
  "/learned-route-segments",
  authenticate,
  requireOrganization,
  requireOperationalAccess,
  async (req, res, next) => {
    try {
      if (!requireReviewEnabled(res)) return;
      if (!canReview(req)) {
        return res.status(403).json({ ok: false, message: "No tienes permiso para revisar mejoras de ruta" });
      }
      const status = String(req.query.status || "").trim().toUpperCase() || undefined;
      const candidates = await req.app.locals.store.listLearnedRouteCandidates({
        organizationId: canAccessAllTenants(req.user) ? undefined : getOrganizationId(req.user),
        status
      });
      const segments = candidates.filter((candidate) =>
        isSegmentCandidate(candidate, autoRouteConfig.segmentAlgorithmVersion)
      );
      const data = (await Promise.all(
        segments.map((candidate) => buildSegmentReview(req.app.locals.store, candidate))
      )).filter(Boolean);
      return res.json({ ok: true, data });
    } catch (error) {
      return next(error);
    }
  }
);

// This handler is deliberately mounted before the legacy navigation router. It
// consumes only V3 segment candidates; V2 full-route candidates fall through to
// the proven legacy approval endpoint unchanged.
router.post(
  "/learned-routes/:candidateId/approve",
  authenticate,
  requireOrganization,
  requireOperationalAccess,
  async (req, res, next) => {
    try {
      const candidate = await req.app.locals.store.getLearnedRouteCandidateById(req.params.candidateId);
      if (!isSegmentCandidate(candidate, autoRouteConfig.segmentAlgorithmVersion)) return next();
      if (!requireReviewEnabled(res)) return;
      if (!canReview(req)) {
        return res.status(403).json({ ok: false, message: "No tienes permiso para aplicar mejoras de ruta" });
      }
      if (!canAccessCandidate(req, candidate)) {
        return res.status(404).json({ ok: false, message: "Sugerencia no encontrada" });
      }
      if (candidate.status === "APPROVED" && candidate.approvedRouteId) {
        return res.json({
          ok: true,
          data: candidate,
          route: await req.app.locals.store.getRouteById(candidate.approvedRouteId),
          application: { mode: "segment_patch", idempotent: true }
        });
      }
      if (candidate.status !== "READY_FOR_REVIEW") {
        return res.status(409).json({
          ok: false,
          code: "candidate_not_ready",
          message: "La mejora aún no tiene evidencia suficiente para aplicarse"
        });
      }

      const metadata = decodeSegmentGeometryVersion(candidate.geometryVersion);
      const currentRoute = await req.app.locals.store.getRouteById(metadata.routeId);
      if (!currentRoute || Number(currentRoute.revision) !== metadata.routeRevision) {
        return res.status(409).json({
          ok: false,
          code: "candidate_stale",
          message: "La ruta oficial cambió mientras se aprendía esta mejora; vuelve a evaluarla contra la revisión actual"
        });
      }

      const [runningResult, pausedResult] = await Promise.all([
        req.app.locals.store.listRouteSessions({ routeId: currentRoute.id, status: "RUNNING", limit: 1 }),
        req.app.locals.store.listRouteSessions({ routeId: currentRoute.id, status: "PAUSED", limit: 1 })
      ]);
      if (itemsFromList(runningResult).length || itemsFromList(pausedResult).length) {
        return res.status(409).json({
          ok: false,
          code: "route_has_active_sessions",
          message: "Finaliza o cancela las jornadas activas antes de cambiar la geometría oficial"
        });
      }

      const result = await applySegmentCandidateToRoute({
        store: req.app.locals.store,
        candidate,
        actor: req.user
      });
      if (!result.applied) {
        const status = ["candidate_stale", "route_not_found"].includes(result.reason) ? 409 : 422;
        return res.status(status).json({
          ok: false,
          code: result.reason,
          message: result.reason === "candidate_stale"
            ? "La ruta cambió antes de confirmar la mejora; no se aplicó ningún tramo"
            : "No fue posible aplicar el tramo aprendido de forma segura"
        });
      }

      const reviewed = await req.app.locals.store.updateLearnedRouteCandidate(candidate.id, {
        status: "APPROVED",
        approvedRouteId: result.route.id,
        reviewedBy: req.user.id,
        reviewedAt: new Date().toISOString(),
        rejectionReason: null
      });

      await recordAuditLog(req, {
        action: "route.learned_segment.applied",
        targetType: "route",
        targetId: result.route.id,
        organizationId: candidate.organizationId,
        metadata: {
          candidateId: candidate.id,
          evidenceCount: candidate.evidenceCount,
          distinctServiceDays: candidate.distinctServiceDays,
          previousRevision: result.metadata.routeRevision,
          revision: result.route.revision,
          segmentStartMeters: result.metadata.startDistanceMeters,
          segmentEndMeters: result.metadata.endDistanceMeters,
          comparison: result.comparison,
          previousRouteSnapshot: {
            revision: result.previousRoute.revision,
            distanceMeters: result.previousRoute.distanceMeters,
            durationSeconds: result.previousRoute.durationSeconds,
            durationInTrafficSeconds: result.previousRoute.durationInTrafficSeconds,
            polyline: result.previousRoute.polyline
          }
        }
      });

      const liveLocations = await req.app.locals.store.getLiveLocations();
      itemsFromList(liveLocations?.vehicles || liveLocations)
        .filter((vehicle) => vehicle.routeId === result.route.id)
        .forEach((vehicle) => {
          emitRouteAudience(
            req,
            candidate.organizationId,
            "location:updated",
            vehicle,
            vehicle.driverId
          );
        });
      emitRouteAudience(req, candidate.organizationId, "route:updated", {
        route: result.route,
        source: "learned_segment",
        candidateId: candidate.id,
        previousRevision: result.metadata.routeRevision,
        revision: result.route.revision
      });

      return res.json({
        ok: true,
        data: reviewed,
        route: result.route,
        application: {
          mode: "segment_patch",
          idempotent: false,
          previousRevision: result.metadata.routeRevision,
          revision: result.route.revision,
          comparison: result.comparison
        }
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
