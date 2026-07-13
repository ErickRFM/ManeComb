const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  canAccessTenantResource,
  canAccessAllTenants,
  getOrganizationId,
  hasPermission
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { planRoute, reverseGeocode, searchPlaces } = require("../../services/navigation-service");
const { recordSessionEvent } = require("../../services/route-event-engine");
const { calculateAndPersistRouteMetrics } = require("../../services/route-metrics-engine");
const { isServiceDate, toServiceDate } = require("../../utils/service-date");

const router = Router();

function normalizePoint(point) {
  if (!point) {
    return null;
  }

  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude
  };
}

function normalizeRouteOption(route) {
  if (!route || typeof route !== "object") {
    return null;
  }

  const polyline = Array.isArray(route.polyline)
    ? route.polyline.map(normalizePoint).filter(Boolean)
    : [];

  if (polyline.length < 2) {
    return null;
  }

  return {
    label: String(route.label || "Ruta recomendada").trim() || "Ruta recomendada",
    distanceMeters: Math.max(0, Number(route.distanceMeters) || 0),
    durationSeconds: Math.max(0, Number(route.durationSeconds) || 0),
    durationInTrafficSeconds: Math.max(0, Number(route.durationInTrafficSeconds) || 0),
    trafficLevel: ["low", "medium", "high"].includes(String(route.trafficLevel || ""))
      ? String(route.trafficLevel)
      : "low",
    polyline
  };
}

function normalizeStops(stops) {
  return (Array.isArray(stops) ? stops : [])
    .map((stop, index) => {
      const point = normalizePoint(stop);

      if (!point) {
        return null;
      }

      return {
        id: String(stop.id || `stop-${index + 1}`).trim() || `stop-${index + 1}`,
        latitude: point.latitude,
        longitude: point.longitude,
        address: String(stop.address || "").trim(),
        order: Math.max(0, Number(stop.order) || index)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order)
    .map((stop, index) => ({
      ...stop,
      order: index
    }));
}

function pointKey(point) {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function getStopsValidationError(origin, destination, stops) {
  const originKey = pointKey(origin);
  const destinationKey = pointKey(destination);
  const seen = new Set();

  for (const stop of stops) {
    const key = pointKey(stop);

    if (key === originKey || key === destinationKey) {
      return "Las paradas no pueden coincidir con origen o destino";
    }

    if (seen.has(key)) {
      return "Las paradas duplicadas no estan permitidas";
    }

    seen.add(key);
  }

  return null;
}

async function getAccessibleVehicle(req, res, vehicleId) {
  const vehicle = await req.app.locals.store.getVehicleById(vehicleId);

  if (!vehicle || !canAccessTenantResource(req.user, vehicle)) {
    res.status(404).json({
      ok: false,
      message: "Unidad no encontrada"
    });
    return null;
  }

  if (req.user.role === "driver" && req.user.vehicleId !== vehicleId) {
    res.status(403).json({
      ok: false,
      message: "No puedes acceder a recorridos de otra unidad"
    });
    return null;
  }

  return vehicle;
}

router.get("/search", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    const origin = normalizePoint({
      latitude: req.query.latitude,
      longitude: req.query.longitude
    });

    if (!query) {
      return res.status(400).json({
        ok: false,
        message: "La consulta de busqueda es obligatoria"
      });
    }

    const fallbackCenter = (await req.app.locals.store.getLiveLocations()).center;
    const results = await searchPlaces(query, origin || fallbackCenter, req.app.locals.store);

    return res.json({
      ok: true,
      data: results
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/reverse", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const point = normalizePoint({
      latitude: req.query.latitude,
      longitude: req.query.longitude
    });

    if (!point) {
      return res.status(400).json({
        ok: false,
        message: "latitude y longitude son obligatorios"
      });
    }

    const result = await reverseGeocode(point);

    return res.json({
      ok: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/plan", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const origin = normalizePoint(req.body.origin);
    const destination = normalizePoint(req.body.destination);
    const stops = normalizeStops(req.body.stops);

    if (!origin || !destination) {
      return res.status(400).json({
        ok: false,
        message: "origin y destination son obligatorios"
      });
    }

    const stopsError = getStopsValidationError(origin, destination, stops);

    if (stopsError) {
      return res.status(400).json({
        ok: false,
        message: stopsError
      });
    }

    const routePlan = await planRoute(origin, destination, stops);

    return res.json({
      ok: true,
      data: {
        ...routePlan,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/assign", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({
        ok: false,
        message: "Solo administracion puede fijar rutas"
      });
    }

    const vehicleId = String(req.body.vehicleId || "").trim();
    const origin = normalizePoint(req.body.origin);
    const destination = normalizePoint(req.body.destination);
    const destinationLabel = String(req.body.destinationLabel || "").trim();
    const originLabel = String(req.body.originLabel || "Ubicacion actual").trim();
    const stops = normalizeStops(req.body.stops);
    const providedRoute = normalizeRouteOption(req.body.route);
    const providedAlternatives = Array.isArray(req.body.alternatives)
      ? req.body.alternatives.map(normalizeRouteOption).filter(Boolean)
      : [];
    const providedProvider = String(req.body.provider || "").trim();

    if (!vehicleId || !origin || !destination || !destinationLabel) {
      return res.status(400).json({
        ok: false,
        message: "vehicleId, origin, destination y destinationLabel son obligatorios"
      });
    }

    const stopsError = getStopsValidationError(origin, destination, stops);

    if (stopsError) {
      return res.status(400).json({
        ok: false,
        message: stopsError
      });
    }

    const vehicle = await getAccessibleVehicle(req, res, vehicleId);

    if (!vehicle) {
      return;
    }

    if (await req.app.locals.store.getActiveRouteSession(vehicleId)) {
      return res.status(409).json({ ok: false, message: "Finaliza la jornada activa antes de cambiar la ruta" });
    }

    const routePlan = providedRoute
      ? {
          provider: providedProvider || "system",
          stops,
          routes: [providedRoute, ...providedAlternatives]
        }
      : await planRoute(origin, destination, stops);
    const [primaryRoute, ...alternatives] = routePlan.routes;

    if (!primaryRoute) {
      return res.status(422).json({
        ok: false,
        message: "No se pudo calcular una ruta valida"
      });
    }

    const updatedVehicle = await req.app.locals.store.assignRouteToVehicle({
      vehicleId,
      assignment: {
        originLabel,
        origin,
        destinationLabel,
        destination,
        stops,
        assignedBy: req.user.id,
        assignedAt: new Date().toISOString(),
        provider: routePlan.provider,
        route: primaryRoute,
        alternatives
      }
    });

    if (!updatedVehicle) {
      return res.status(404).json({
        ok: false,
        message: "Unidad no encontrada"
      });
    }

    req.app.locals.io
      ?.to(`org:${String(vehicle.organizationId || getOrganizationId(req.user)).trim()}`)
      .emit("location:updated", updatedVehicle);

    return res.json({
      ok: true,
      data: updatedVehicle
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/assign/:vehicleId", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({
        ok: false,
        message: "Solo administracion puede limpiar rutas"
      });
    }

    const vehicleId = String(req.params.vehicleId || "").trim();

    if (!vehicleId) {
      return res.status(400).json({
        ok: false,
        message: "vehicleId es obligatorio"
      });
    }

    const vehicle = await getAccessibleVehicle(req, res, vehicleId);

    if (!vehicle) {
      return;
    }

    if (await req.app.locals.store.getActiveRouteSession(vehicleId)) {
      return res.status(409).json({ ok: false, message: "Finaliza la jornada activa antes de quitar la ruta" });
    }

    const updatedVehicle = await req.app.locals.store.clearAssignedRouteFromVehicle(vehicleId);

    if (!updatedVehicle) {
      return res.status(404).json({
        ok: false,
        message: "Unidad no encontrada"
      });
    }

    req.app.locals.io
      ?.to(`org:${String(vehicle.organizationId || getOrganizationId(req.user)).trim()}`)
      .emit("location:updated", updatedVehicle);

    return res.json({
      ok: true,
      data: updatedVehicle
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/sessions", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const vehicleId = String(req.query.vehicleId || req.user.vehicleId || "").trim();
    if (!vehicleId) return res.status(400).json({ ok: false, message: "vehicleId es obligatorio" });
    const vehicle = await getAccessibleVehicle(req, res, vehicleId);
    if (!vehicle) return;
    const sessions = await req.app.locals.store.listRouteSessions({
      vehicleId,
      limit: Math.max(1, Math.min(100, Number(req.query.limit) || 50))
    });
    return res.json({ ok: true, data: sessions });
  } catch (error) { return next(error); }
});

router.get("/sessions/active", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const vehicleId = String(req.query.vehicleId || req.user.vehicleId || "").trim();
    if (!vehicleId) return res.status(400).json({ ok: false, message: "vehicleId es obligatorio" });
    const vehicle = await getAccessibleVehicle(req, res, vehicleId);
    if (!vehicle) return;
    return res.json({ ok: true, data: await req.app.locals.store.getActiveRouteSession(vehicleId) });
  } catch (error) { return next(error); }
});

router.post("/sessions/start", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const vehicleId = String(req.body.vehicleId || req.user.vehicleId || "").trim();
    const vehicle = await getAccessibleVehicle(req, res, vehicleId);
    if (!vehicle) return;
    if (!vehicle.assignedRoute) return res.status(409).json({ ok: false, message: "La unidad no tiene una ruta asignada" });
    if (!vehicle.driverId) return res.status(409).json({ ok: false, message: "La unidad no tiene chofer asignado" });
    if (req.user.role === "driver" && vehicle.driverId !== req.user.id) {
      return res.status(403).json({ ok: false, message: "Solo el chofer asignado puede iniciar la jornada" });
    }
    const session = await req.app.locals.store.createRouteSession({
      organizationId: String(vehicle.organizationId || getOrganizationId(req.user)).trim(),
      routeId: vehicle.routeId || `assigned:${vehicle.id}:${vehicle.assignedRoute.assignedAt || "current"}`,
      vehicleId,
      driverId: vehicle.driverId,
      startedAt: new Date().toISOString(),
      startedOdometer: Number.isFinite(Number(req.body.startedOdometer)) ? Number(req.body.startedOdometer) : vehicle.currentKilometers ?? null,
      startBattery: Number.isFinite(Number(req.body.startBattery)) ? Number(req.body.startBattery) : null,
      startGpsAccuracy: Number.isFinite(Number(req.body.startGpsAccuracy)) ? Number(req.body.startGpsAccuracy) : null,
      deviceInfo: req.body.deviceInfo && typeof req.body.deviceInfo === "object" ? req.body.deviceInfo : null,
      assignedBy: vehicle.assignedRoute?.assignedBy || null,
      startedBy: req.user.id,
      updatedBy: req.user.id
    });
    const { creationApplied, ...publicSession } = session;
    if (creationApplied) {
      await recordSessionEvent(req.app.locals.store, publicSession, "SESSION_STARTED", {
        startedBy: req.user.id,
        vehicleId
      });
      req.app.locals.io?.to(`org:${session.organizationId}`).emit("route-session:updated", publicSession);
      req.app.locals.io?.to(`user:${session.driverId}`).emit("route-session:updated", publicSession);
    }
    return res.status(creationApplied ? 201 : 200).json({ ok: true, data: publicSession });
  } catch (error) { return next(error); }
});

router.patch("/sessions/:sessionId/status", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const nextStatus = String(req.body.status || "").trim().toUpperCase();
    const transitions = { RUNNING: ["PAUSED", "FINISHED", "CANCELLED"], PAUSED: ["RUNNING", "FINISHED", "CANCELLED"] };
    const vehicleId = String(req.body.vehicleId || req.user.vehicleId || "").trim();
    const vehicle = await getAccessibleVehicle(req, res, vehicleId);
    if (!vehicle) return;
    const existing = await req.app.locals.store.getRouteSessionById(req.params.sessionId);
    if (!existing || existing.vehicleId !== vehicleId) return res.status(404).json({ ok: false, message: "Jornada no encontrada" });
    if (["FINISHED", "CANCELLED"].includes(existing.status)) {
      if (existing.status === nextStatus) return res.json({ ok: true, data: existing });
      return res.status(409).json({ ok: false, message: "La jornada ya esta cerrada" });
    }
    const active = existing;
    if (!transitions[active.status]?.includes(nextStatus)) return res.status(409).json({ ok: false, message: "Transicion de jornada invalida" });
    const terminal = ["FINISHED", "CANCELLED"].includes(nextStatus);
    const session = await req.app.locals.store.updateRouteSession(active.id, {
      expectedStatus: active.status,
      status: nextStatus,
      finishedAt: terminal ? new Date().toISOString() : null,
      finishedOdometer: terminal && Number.isFinite(Number(req.body.finishedOdometer)) ? Number(req.body.finishedOdometer) : null,
      endBattery: terminal && Number.isFinite(Number(req.body.endBattery)) ? Number(req.body.endBattery) : null,
      endGpsAccuracy: terminal && Number.isFinite(Number(req.body.endGpsAccuracy)) ? Number(req.body.endGpsAccuracy) : null,
      finishReason: terminal ? String(req.body.finishReason || (nextStatus === "FINISHED" ? "completed" : "cancelled")).trim() : null,
      finishedBy: terminal ? req.user.id : null,
      updatedBy: req.user.id
    });
    const { transitionApplied, ...initialPublicSession } = session;
    let publicSession = initialPublicSession;
    if (transitionApplied) {
      const eventType =
        nextStatus === "PAUSED"
          ? "SESSION_PAUSED"
          : nextStatus === "RUNNING"
            ? "SESSION_RESUMED"
            : "SESSION_FINISHED";
      await recordSessionEvent(req.app.locals.store, publicSession, eventType, {
        previousStatus: active.status,
        nextStatus,
        updatedBy: req.user.id,
        finishReason: publicSession.finishReason || null
      });
      if (nextStatus === "FINISHED") {
        try {
          const processedSession = await calculateAndPersistRouteMetrics(req.app.locals.store, publicSession.id);
          const { transitionApplied: ignoredTransition, ...processedPublicSession } = processedSession || {};
          publicSession = processedPublicSession;
        } catch {
          publicSession = await req.app.locals.store.getRouteSessionById(publicSession.id);
        }
      }
      req.app.locals.io?.to(`org:${session.organizationId}`).emit("route-session:updated", publicSession);
      req.app.locals.io?.to(`user:${session.driverId}`).emit("route-session:updated", publicSession);
    }
    return res.json({ ok: true, data: publicSession });
  } catch (error) { return next(error); }
});

router.get("/sessions/history", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const requestedVehicleId = String(req.query.vehicleId || "").trim();
    const vehicleId = req.user.role === "driver"
      ? String(req.user.vehicleId || "").trim()
      : requestedVehicleId;

    if (vehicleId) {
      const vehicle = await getAccessibleVehicle(req, res, vehicleId);
      if (!vehicle) return;
    }

    const paginated = typeof req.query.offset !== "undefined";
    const limit = Math.max(1, Math.min(paginated ? 500 : 5000, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const result = await req.app.locals.store.listRouteSessions({
      organizationId: canAccessAllTenants(req.user) ? undefined : getOrganizationId(req.user),
      vehicleId: vehicleId || undefined,
      driverId: req.query.driverId ? String(req.query.driverId).trim() : undefined,
      routeId: req.query.routeId ? String(req.query.routeId).trim() : undefined,
      status: req.query.status ? String(req.query.status).trim().toUpperCase() : undefined,
      dateFrom: req.query.dateFrom ? String(req.query.dateFrom).trim() : undefined,
      dateTo: req.query.dateTo ? String(req.query.dateTo).trim() : undefined,
      limit,
      offset,
      includeTotal: paginated
    });

    return res.json({ ok: true, data: result });
  } catch (error) { return next(error); }
});

router.get("/sessions/:sessionId/metrics", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const session = await req.app.locals.store.getRouteSessionById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ ok: false, message: "Jornada no encontrada" });
    }

    const vehicle = await getAccessibleVehicle(req, res, session.vehicleId);
    if (!vehicle) return;

    return res.json({
      ok: true,
      data: {
        id: session.id,
        sessionId: session.id,
        status: session.status,
        statisticsReady: session.statisticsReady === true,
        processingStatus: session.processingStatus || "PENDING",
        processingError: session.processingError || null,
        processingCompletedAt: session.processingCompletedAt || null,
        metrics: session.metrics || null,
        totalDistance: session.totalDistance ?? null,
        totalDuration: session.totalDuration ?? null,
        movingTime: session.movingTime ?? null,
        stoppedTime: session.stoppedTime ?? null,
        gpsLostTime: session.gpsLostTime ?? null,
        offRouteTime: session.offRouteTime ?? null,
        checkpointCount: session.checkpointCount ?? null,
        completedCheckpoints: session.completedCheckpoints ?? null,
        completedLaps: session.completedLaps ?? null,
        averageSpeed: session.averageSpeed ?? null,
        maxSpeed: session.maxSpeed ?? null,
        averageGpsAccuracy: session.averageGpsAccuracy ?? null,
        gpsLostEvents: session.gpsLostEvents ?? null,
        offRouteEvents: session.offRouteEvents ?? null,
        stopEvents: session.stopEvents ?? null
      }
    });
  } catch (error) { return next(error); }
});

router.post("/sessions/:sessionId/recalculate", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "Solo administracion puede recalcular jornadas" });
    }

    const session = await req.app.locals.store.getRouteSessionById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ ok: false, message: "Jornada no encontrada" });
    }

    const vehicle = await getAccessibleVehicle(req, res, session.vehicleId);
    if (!vehicle) return;

    if (session.status !== "FINISHED") {
      return res.status(409).json({ ok: false, message: "Solo se recalculan jornadas finalizadas" });
    }

    const processedSession = await calculateAndPersistRouteMetrics(req.app.locals.store, session.id);

    return res.json({ ok: true, data: processedSession });
  } catch (error) { return next(error); }
});

router.get("/sessions/:sessionId/events", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const session = await req.app.locals.store.getRouteSessionById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ ok: false, message: "Jornada no encontrada" });
    }

    const vehicle = await getAccessibleVehicle(req, res, session.vehicleId);
    if (!vehicle) return;

    const events = await req.app.locals.store.listRouteEvents({
      sessionId: session.id,
      eventType: req.query.type ? String(req.query.type).trim().toUpperCase() : undefined,
      limit: Math.max(1, Math.min(2000, Number(req.query.limit) || 500))
    });

    return res.json({ ok: true, data: events });
  } catch (error) { return next(error); }
});

router.get("/sessions/:sessionId/checkpoint-visits", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const session = await req.app.locals.store.getRouteSessionById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ ok: false, message: "Jornada no encontrada" });
    }

    const vehicle = await getAccessibleVehicle(req, res, session.vehicleId);
    if (!vehicle) return;

    const visits = await req.app.locals.store.listCheckpointVisits({
      sessionId: session.id,
      limit: Math.max(1, Math.min(2000, Number(req.query.limit) || 500))
    });

    return res.json({ ok: true, data: visits });
  } catch (error) { return next(error); }
});

router.get("/sessions/:sessionId/positions", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const session = await req.app.locals.store.getRouteSessionById(req.params.sessionId);

    if (!session) {
      return res.status(404).json({ ok: false, message: "Jornada no encontrada" });
    }

    const vehicle = await getAccessibleVehicle(req, res, session.vehicleId);
    if (!vehicle) return;

    const paginated = typeof req.query.offset !== "undefined";
    const limit = Math.max(1, Math.min(paginated ? 5000 : 50000, Number(req.query.limit) || (paginated ? 800 : 5000)));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const result = await req.app.locals.store.listRouteSessionPositions({
      sessionId: session.id,
      limit,
      offset,
      includeTotal: paginated
    });
    const items = [...(paginated ? result.items || [] : result)].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

    return res.json({
      ok: true,
      data: paginated ? {
        ...result,
        items
      } : items
    });
  } catch (error) { return next(error); }
});

router.get("/trips", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const vehicleId = String(req.query.vehicleId || "").trim();
    const requestedDate = String(req.query.date || "").trim();
    const serviceDate = requestedDate ? requestedDate : toServiceDate(new Date());
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 12));

    if (!vehicleId) {
      return res.status(400).json({
        ok: false,
        message: "vehicleId es obligatorio"
      });
    }

    if (!isServiceDate(serviceDate)) {
      return res.status(400).json({
        ok: false,
        message: "date debe usar el formato YYYY-MM-DD"
      });
    }

    const vehicle = await getAccessibleVehicle(req, res, vehicleId);

    if (!vehicle) {
      return;
    }

    const logs = await req.app.locals.store.listTripLogs({
      vehicleId,
      serviceDate,
      limit
    });

    return res.json({
      ok: true,
      data: {
        vehicleId,
        serviceDate,
        logs
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/trips", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    const vehicleId = String(req.body.vehicleId || "").trim();
    const origin = normalizePoint(req.body.origin);
    const destination = normalizePoint(req.body.destination);
    const originLabel = String(req.body.originLabel || "").trim();
    const destinationLabel = String(req.body.destinationLabel || "").trim();
    const startedAt = new Date(req.body.startedAt);
    const finishedAt = new Date(req.body.finishedAt);
    const durationSeconds = Math.max(1, Number(req.body.durationSeconds) || 0);

    if (!vehicleId || !origin || !destination || !originLabel || !destinationLabel) {
      return res.status(400).json({
        ok: false,
        message: "vehicleId, origin, destination, originLabel y destinationLabel son obligatorios"
      });
    }

    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(finishedAt.getTime()) || finishedAt <= startedAt) {
      return res.status(400).json({
        ok: false,
        message: "Las fechas del recorrido no son validas"
      });
    }

    const vehicle = await getAccessibleVehicle(req, res, vehicleId);

    if (!vehicle) {
      return;
    }

    const tripLog = await req.app.locals.store.createTripLog({
      vehicleId,
      vehicleCode: String(req.body.vehicleCode || vehicle.code || "").trim(),
      serviceDate:
        (isServiceDate(req.body.serviceDate) && String(req.body.serviceDate).trim()) ||
        toServiceDate(finishedAt),
      originLabel,
      destinationLabel,
      origin,
      destination,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationSeconds,
      distanceMeters: Math.max(0, Number(req.body.distanceMeters) || 0),
      plannedDurationSeconds: Math.max(0, Number(req.body.plannedDurationSeconds) || 0),
      provider: String(req.body.provider || "system").trim() || "system",
      registeredBy: req.user.id
    });

    req.app.locals.io
      ?.to(`org:${String(tripLog.organizationId || getOrganizationId(req.user)).trim()}`)
      .emit("navigation:trip-recorded", tripLog);

    return res.status(201).json({
      ok: true,
      data: tripLog
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
