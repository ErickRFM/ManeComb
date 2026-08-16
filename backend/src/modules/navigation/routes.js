const { Router } = require("express");
const { randomUUID } = require("crypto");
const { authenticate } = require("../../middlewares/authenticate");
const {
  canAccessTenantResource,
  canAccessAllTenants,
  getOrganizationId,
  getRolesWithPermission,
  hasPermission,
  requireOrganization
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { canActivate } = require("../../domain/vehicle-route-assignment");
const { planRoute, reverseGeocode, searchPlaces } = require("../../services/navigation-service");
const { recordSessionEvent } = require("../../services/route-event-engine");
const { calculateAndPersistRouteMetrics } = require("../../services/route-metrics-engine");
const { processCompletedRouteSession } = require("../../services/auto-route-learning");
const autoRouteConfig = require("../../config/auto-route");
const { isServiceDate, toServiceDate } = require("../../utils/service-date");
const { resolveSessionStartedAt } = require("../../services/tracking-time");
const { emitOperationalUnitUpdate } = require("../../services/operational-units-service");

const router = Router();

function requireAutoRouteReview(res) {
  if (autoRouteConfig.reviewEnabled) return true;
  res.status(503).json({
    ok: false,
    code: "auto_route_review_disabled",
    message: "La revisión de rutas sugeridas no está habilitada"
  });
  return false;
}

function emitToRouteAudience(req, organizationId, eventName, payload, driverId = null) {
  getRolesWithPermission("canViewAnalytics").forEach((role) => {
    req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit(eventName, payload);
  });
  if (driverId) req.app.locals.io?.to(`user:${driverId}`).emit(eventName, payload);
  req.app.locals.io?.to("platform:admin").emit(eventName, payload);
}

async function emitVehicleAuthorities(req, organizationId, vehicle) {
  emitToRouteAudience(req, organizationId, "vehicle:updated", { vehicle }, vehicle.driverId);
  await emitOperationalUnitUpdate({
    io: req.app.locals.io,
    store: req.app.locals.store,
    vehicle,
    organizationId,
    getRolesWithPermission
  });
}

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

function buildRouteCode(name) {
  return String(name || "ruta")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 24) || "RUTA";
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

  if (vehicle.retiredAt) {
    res.status(409).json({
      ok: false,
      message: "La unidad fue retirada y ya no puede operar"
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

router.post("/routes", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({
        ok: false,
        message: "Solo administracion puede guardar rutas"
      });
    }

    const name = String(req.body.name || "").trim();
    const origin = normalizePoint(req.body.origin);
    const destination = normalizePoint(req.body.destination);
    const stops = normalizeStops(req.body.stops);
    const route = normalizeRouteOption(req.body.route);

    if (!name || !origin || !destination || !route) {
      return res.status(400).json({
        ok: false,
        message: "name, origin, destination y route son obligatorios"
      });
    }

    const stopsError = getStopsValidationError(origin, destination, stops);

    if (stopsError) {
      return res.status(400).json({
        ok: false,
        message: stopsError
      });
    }

    const originLabel = String(req.body.originLabel || "").trim();
    const destinationLabel = String(req.body.destinationLabel || "").trim();

    const savedRoute = await req.app.locals.store.createRoute({
      id: randomUUID(),
      name,
      code: buildRouteCode(name),
      color: "#1473E6",
      origin,
      destination,
      originLabel,
      destinationLabel,
      stops,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      durationInTrafficSeconds: route.durationInTrafficSeconds,
      polyline: route.polyline,
      organizationId: getOrganizationId(req.user),
      createdBy: req.user.id
    });

    return res.status(201).json({
      ok: true,
      data: savedRoute
    });
  } catch (error) {
    if (error.message && error.message.includes("Ya existe una ruta")) {
      return res.status(409).json({ ok: false, message: error.message });
    }
    return next(error);
  }
});

router.get("/learned-routes", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!requireAutoRouteReview(res)) return;
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para revisar rutas sugeridas" });
    }
    const status = String(req.query.status || "").trim().toUpperCase() || undefined;
    const candidates = await req.app.locals.store.listLearnedRouteCandidates({
      organizationId: canAccessAllTenants(req.user) ? undefined : getOrganizationId(req.user),
      status
    });
    return res.json({ ok: true, data: candidates });
  } catch (error) { return next(error); }
});

router.get("/learned-routes/:candidateId", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!requireAutoRouteReview(res)) return;
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para revisar rutas sugeridas" });
    }
    const candidate = await req.app.locals.store.getLearnedRouteCandidateById(req.params.candidateId);
    if (!candidate || (!canAccessAllTenants(req.user) && candidate.organizationId !== getOrganizationId(req.user))) {
      return res.status(404).json({ ok: false, message: "Sugerencia no encontrada" });
    }
    return res.json({ ok: true, data: candidate });
  } catch (error) { return next(error); }
});

router.post("/learned-routes/:candidateId/approve", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!requireAutoRouteReview(res)) return;
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para aprobar rutas sugeridas" });
    }
    const candidate = await req.app.locals.store.getLearnedRouteCandidateById(req.params.candidateId);
    if (!candidate || (!canAccessAllTenants(req.user) && candidate.organizationId !== getOrganizationId(req.user))) {
      return res.status(404).json({ ok: false, message: "Sugerencia no encontrada" });
    }
    if (candidate.status === "APPROVED" && candidate.approvedRouteId) {
      return res.json({ ok: true, data: candidate, route: await req.app.locals.store.getRouteById(candidate.approvedRouteId) });
    }
    if (candidate.status !== "READY_FOR_REVIEW") {
      return res.status(409).json({ ok: false, message: "La sugerencia aun no esta lista para aprobacion" });
    }
    const name = String(req.body.name || `Ruta sugerida ${candidate.id.slice(0, 8)}`).trim();
    const route = await req.app.locals.store.createRoute({
      id: randomUUID(),
      name,
      code: buildRouteCode(name),
      color: "#1473E6",
      origin: candidate.origin,
      destination: candidate.destination,
      originLabel: String(req.body.originLabel || "Origen aprendido").trim(),
      destinationLabel: String(req.body.destinationLabel || "Destino aprendido").trim(),
      stops: [],
      distanceMeters: candidate.distanceMeters,
      durationSeconds: candidate.durationSeconds,
      durationInTrafficSeconds: candidate.durationSeconds,
      polyline: candidate.polyline,
      organizationId: candidate.organizationId,
      createdBy: req.user.id
    });
    const reviewed = await req.app.locals.store.updateLearnedRouteCandidate(candidate.id, {
      status: "APPROVED",
      approvedRouteId: route.id,
      reviewedBy: req.user.id,
      reviewedAt: new Date().toISOString(),
      rejectionReason: null
    });
    return res.status(201).json({ ok: true, data: reviewed, route });
  } catch (error) { return next(error); }
});

router.post("/learned-routes/:candidateId/reject", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!requireAutoRouteReview(res)) return;
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para rechazar rutas sugeridas" });
    }
    const candidate = await req.app.locals.store.getLearnedRouteCandidateById(req.params.candidateId);
    if (!candidate || (!canAccessAllTenants(req.user) && candidate.organizationId !== getOrganizationId(req.user))) {
      return res.status(404).json({ ok: false, message: "Sugerencia no encontrada" });
    }
    if (["APPROVED", "REJECTED"].includes(candidate.status)) {
      return res.status(409).json({ ok: false, message: "La sugerencia ya fue revisada" });
    }
    const reviewed = await req.app.locals.store.updateLearnedRouteCandidate(candidate.id, {
      status: "REJECTED",
      reviewedBy: req.user.id,
      reviewedAt: new Date().toISOString(),
      rejectionReason: String(req.body.reason || "No aprobada por operaciones").trim()
    });
    return res.json({ ok: true, data: reviewed });
  } catch (error) { return next(error); }
});

router.get("/routes", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    const routes = await req.app.locals.store.listRoutes(req.user);
    return res.json({ ok: true, data: routes });
  } catch (error) {
    return next(error);
  }
});

router.patch("/routes/:routeId", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({
        ok: false,
        message: "Solo administracion puede editar rutas"
      });
    }

    const routeId = String(req.params.routeId || "").trim();
    const name = String(req.body.name || "").trim();
    const origin = normalizePoint(req.body.origin);
    const destination = normalizePoint(req.body.destination);
    const stops = normalizeStops(req.body.stops);
    const route = normalizeRouteOption(req.body.route);

    if (!routeId || !name || !origin || !destination || !route) {
      return res.status(400).json({
        ok: false,
        message: "routeId, name, origin, destination y route son obligatorios"
      });
    }

    const stopsError = getStopsValidationError(origin, destination, stops);

    if (stopsError) {
      return res.status(400).json({
        ok: false,
        message: stopsError
      });
    }

    const originLabel = String(req.body.originLabel || "").trim();
    const destinationLabel = String(req.body.destinationLabel || "").trim();

    const updatedRoute = await req.app.locals.store.updateRoute(routeId, {
      name,
      code: buildRouteCode(name),
      color: "#1473E6",
      origin,
      destination,
      originLabel,
      destinationLabel,
      stops,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      durationInTrafficSeconds: route.durationInTrafficSeconds,
      polyline: route.polyline
    }, req.user);

    if (!updatedRoute) {
      return res.status(404).json({
        ok: false,
        message: "Ruta no encontrada"
      });
    }

    const liveLocations = await req.app.locals.store.getLiveLocations();
    await Promise.all(liveLocations.vehicles
      .filter((vehicle) => vehicle.routeId === updatedRoute.id)
      .map((vehicle) => emitVehicleAuthorities(req, getOrganizationId(req.user), vehicle)));

    return res.json({
      ok: true,
      data: updatedRoute
    });
  } catch (error) {
    if (error.message && error.message.includes("Ya existe una ruta")) {
      return res.status(409).json({ ok: false, message: error.message });
    }
    return next(error);
  }
});

router.delete("/routes/:routeId", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({
        ok: false,
        message: "Solo administracion puede eliminar rutas"
      });
    }

    const routeId = String(req.params.routeId || "").trim();

    if (!routeId) {
      return res.status(400).json({
        ok: false,
        message: "routeId es obligatorio"
      });
    }

    const savedRoute = await req.app.locals.store.getRouteById(routeId);

    if (!savedRoute || !canAccessTenantResource(req.user, savedRoute)) {
      return res.status(404).json({
        ok: false,
        message: "Ruta no encontrada"
      });
    }

    const dependencies = [];
    const liveLocations = await req.app.locals.store.getLiveLocations();
    const assignedVehicles = (liveLocations.vehicles || []).filter(
      (vehicle) => vehicle.routeId === routeId
    );

    if (assignedVehicles.length > 0) {
      const unitWord = assignedVehicles.length === 1 ? "unidad" : "unidades";
      dependencies.push(
        `está asignada a ${assignedVehicles.length} ${unitWord}`
      );
    }

    const activeSessions = await req.app.locals.store.listRouteSessions({
      routeId,
      status: "RUNNING",
      limit: 1
    });

    const activeSessionsCount = Array.isArray(activeSessions)
      ? activeSessions.length
      : activeSessions?.items?.length || 0;

    if (activeSessionsCount > 0) {
      dependencies.push("tiene jornadas activas en curso");
    }

    if (dependencies.length > 0) {
      const detail = dependencies.join(", ");
      return res.status(409).json({
        ok: false,
        message: `No es posible eliminar la ruta "${savedRoute.name}" porque ${detail}. Resuélvalos antes de continuar.`
      });
    }

    const affectedVehicleIds = new Set(
      assignedVehicles.map((vehicle) => vehicle.id)
    );
    const deletedRoute = await req.app.locals.store.deleteRoute(routeId, req.user);

    if (!deletedRoute) {
      return res.status(404).json({
        ok: false,
        message: "Ruta no encontrada"
      });
    }

    const liveAfterDelete = await req.app.locals.store.getLiveLocations();
    await Promise.all(liveAfterDelete.vehicles
      .filter((vehicle) => affectedVehicleIds.has(vehicle.id))
      .map((vehicle) => emitVehicleAuthorities(req, getOrganizationId(req.user), vehicle)));

    return res.json({
      ok: true,
      data: deletedRoute
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
    const routeId = String(req.body.routeId || "").trim();

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

    if (vehicle.retiredAt) {
      return res.status(409).json({
        ok: false,
        message: "Una unidad retirada no puede recibir una ruta"
      });
    }

    if (await req.app.locals.store.getActiveRouteSession(vehicleId)) {
      return res.status(409).json({ ok: false, message: "Finaliza la jornada activa antes de cambiar la ruta" });
    }

    if (routeId) {
      const savedRoute = await req.app.locals.store.getRouteById(routeId);

      if (!savedRoute || !canAccessTenantResource(req.user, savedRoute)) {
        return res.status(404).json({
          ok: false,
          message: "Ruta no encontrada"
        });
      }
    }

    const assignment = {
      originLabel: String(req.body.originLabel || "").trim(),
      destinationLabel: String(req.body.destinationLabel || "").trim(),
      origin: normalizePoint(req.body.origin),
      destination: normalizePoint(req.body.destination),
      provider: String(req.body.provider || "manual").trim(),
    };

    const updatedVehicle = await req.app.locals.store.assignRouteToVehicle({
      vehicleId,
      routeId: routeId || null,
      assignment,
      assignedBy: req.user.id
    });

    if (!updatedVehicle) {
      return res.status(404).json({
        ok: false,
        message: "Unidad no encontrada"
      });
    }

    await emitVehicleAuthorities(req, String(vehicle.organizationId || getOrganizationId(req.user)).trim(), updatedVehicle);

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

    await emitVehicleAuthorities(req, String(vehicle.organizationId || getOrganizationId(req.user)).trim(), updatedVehicle);

    return res.json({
      ok: true,
      data: updatedVehicle
    });
  } catch (error) {
    return next(error);
  }
});

// ===== RC-MULTI-ROUTE-DRIVER-01 F4: API admin de asignaciones ruta-vehiculo =====
// Consume el motor F3 (escritor unico del subsistema). NO toca el escritor legado /assign (gate F6).

// Mapeo de razones de conflicto del motor -> [status HTTP, mensaje].
const ASSIGNMENT_CONFLICT = {
  not_found: [404, "Asignacion no encontrada"],
  vehicle_not_found: [404, "Unidad no encontrada"],
  already_active: [409, "La unidad ya tiene una asignacion activa"],
  active_route_session: [409, "Finaliza la jornada activa antes de cambiar la ruta"],
  active_assignment_conflict: [409, "La asignacion activa cambio; reintenta"],
  activation_version_conflict: [409, "La asignacion cambio; reintenta"],
  admin_locked: [409, "La asignacion no es seleccionable"],
  invalid_status: [409, "La asignacion no puede activarse en su estado actual"],
  expired: [409, "La asignacion expiro"],
  out_of_window: [409, "Fuera de la ventana horaria de la asignacion"],
  outside_schedule: [409, "Fuera de la jornada operativa"],
  no_route: [409, "La asignacion no tiene ruta"],
  route_projection_failed: [409, "No fue posible proyectar la ruta"],
  transaction_unavailable: [503, "Servicio temporalmente no disponible, reintenta"]
};

function respondAssignmentConflict(res, reason) {
  const [status, message] = ASSIGNMENT_CONFLICT[reason] || [409, "No fue posible activar la asignacion"];
  return res.status(status).json({ ok: false, code: reason, message });
}

// Vista MINIMA del vehiculo para el evento (sin geometria/coordenadas crudas).
function minimalVehicleView(vehicle) {
  if (!vehicle) return null;
  return {
    id: vehicle.id || vehicle._id || null,
    routeId: vehicle.routeId || null,
    routeName: vehicle.routeName || (vehicle.assignedRoute && vehicle.assignedRoute.routeName) || null,
    driverId: vehicle.driverId || null
  };
}

router.post("/assignments", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "Solo administracion puede crear asignaciones" });
    }

    const vehicleId = String(req.body.vehicleId || "").trim();
    const routeId = String(req.body.routeId || "").trim();
    if (!vehicleId || !routeId) {
      return res.status(400).json({ ok: false, message: "vehicleId y routeId son obligatorios" });
    }

    const vehicle = await getAccessibleVehicle(req, res, vehicleId);
    if (!vehicle) return undefined; // getAccessibleVehicle ya respondio

    const route = await req.app.locals.store.getRouteById(routeId);
    if (!route || !canAccessTenantResource(req.user, route)) {
      return res.status(404).json({ ok: false, message: "Ruta no encontrada" });
    }

    const organizationId = String(vehicle.organizationId || getOrganizationId(req.user)).trim();
    const assignment = await req.app.locals.store.createVehicleRouteAssignment({
      organizationId,
      vehicleId,
      routeId,
      priority: req.body.priority,
      selectableByDriver: req.body.selectableByDriver,
      scheduledFrom: req.body.scheduledFrom,
      scheduledUntil: req.body.scheduledUntil,
      assignedBy: req.user.id
    });

    return res.status(201).json({ ok: true, data: assignment });
  } catch (error) {
    if (error.message && error.message.startsWith("invalid_assignment_input")) {
      return res.status(400).json({ ok: false, code: error.message, message: "Datos de asignacion invalidos" });
    }
    return next(error);
  }
});

router.get("/assignments", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "Solo administracion puede consultar asignaciones" });
    }

    const vehicleId = String(req.query.vehicleId || "").trim();
    if (!vehicleId) {
      return res.status(400).json({ ok: false, message: "vehicleId es obligatorio" });
    }

    const vehicle = await getAccessibleVehicle(req, res, vehicleId);
    if (!vehicle) return undefined;

    const organizationId = String(vehicle.organizationId || getOrganizationId(req.user)).trim();
    const status = String(req.query.status || "").trim() || undefined;
    const items = await req.app.locals.store.listVehicleRouteAssignments({ organizationId, vehicleId, status });

    return res.json({ ok: true, data: items });
  } catch (error) {
    return next(error);
  }
});

// --- F5: API driver (auto-seleccion respetando selectableByDriver). Registrado ANTES de
// /assignments/:assignmentId para que "mine" no caiga en el parametro :assignmentId. ---
const DRIVER_NON_TERMINAL = ["AVAILABLE", "SCHEDULED", "ACTIVE"];

router.get("/assignments/mine", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para consultar tus asignaciones" });
    }

    const vehicleId = String(req.query.vehicleId || req.user.vehicleId || "").trim();
    if (!vehicleId) {
      return res.status(400).json({ ok: false, message: "vehicleId es obligatorio" });
    }

    const vehicle = await getAccessibleVehicle(req, res, vehicleId);
    if (!vehicle) return undefined;
    if (req.user.role === "driver" && vehicle.driverId !== req.user.id) {
      return res.status(403).json({ ok: false, message: "Solo el chofer asignado puede consultar sus asignaciones" });
    }

    const organizationId = String(vehicle.organizationId || getOrganizationId(req.user)).trim();
    const items = await req.app.locals.store.listVehicleRouteAssignments({ organizationId, vehicleId, statuses: DRIVER_NON_TERMINAL });
    const active = items.find((a) => a.status === "ACTIVE") || null;
    const now = new Date();
    const data = items.map((assignment) => {
      const check = canActivate(assignment, {
        organizationId, vehicleId, actor: "driver", now,
        hasOtherActive: Boolean(active && active.id !== assignment.id)
      });
      return { ...assignment, selectable: check.ok, selectableReason: check.ok ? null : check.reason };
    });

    return res.json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
});

router.post("/assignments/:assignmentId/select", authenticate, requireOperationalAccess, async (req, res, next) => {
  try {
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para seleccionar una ruta" });
    }

    const assignmentId = String(req.params.assignmentId || "").trim();
    const existing = await req.app.locals.store.getVehicleRouteAssignmentById(assignmentId);
    if (!existing || !canAccessTenantResource(req.user, { organizationId: existing.organizationId })) {
      return res.status(404).json({ ok: false, message: "Asignacion no encontrada" });
    }

    const vehicle = await getAccessibleVehicle(req, res, existing.vehicleId);
    if (!vehicle) return undefined; // driver de otra unidad -> 403 aqui
    if (req.user.role === "driver" && vehicle.driverId !== req.user.id) {
      return res.status(403).json({ ok: false, message: "Solo el chofer asignado puede seleccionar la ruta" });
    }

    const organizationId = String(existing.organizationId || getOrganizationId(req.user)).trim();
    const result = await req.app.locals.store.activateVehicleRouteAssignment({
      organizationId,
      vehicleId: existing.vehicleId,
      assignmentId,
      actor: "driver",
      actorId: req.user.id,
      source: "driver",
      reason: "driver_selected",
      expectedActiveAssignmentId: req.body.expectedActiveAssignmentId,
      expectedActivationVersion: req.body.expectedActivationVersion
    });

    if (result.outcome === "CONFLICT") {
      return respondAssignmentConflict(res, result.reason);
    }

    if (result.applied && result.event) {
      const payload = { ...result.event, assignment: result.assignment, vehicle: minimalVehicleView(result.vehicle) };
      emitToRouteAudience(req, organizationId, "route-assignment:updated", payload, vehicle.driverId);
    }

    return res.json({
      ok: true,
      data: {
        outcome: result.outcome,
        applied: result.applied,
        assignment: result.assignment,
        vehicle: minimalVehicleView(result.vehicle)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/assignments/:assignmentId", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "Solo administracion puede consultar asignaciones" });
    }

    const assignment = await req.app.locals.store.getVehicleRouteAssignmentById(String(req.params.assignmentId || "").trim());
    if (!assignment || !canAccessTenantResource(req.user, { organizationId: assignment.organizationId })) {
      return res.status(404).json({ ok: false, message: "Asignacion no encontrada" });
    }

    return res.json({ ok: true, data: assignment });
  } catch (error) {
    return next(error);
  }
});

router.post("/assignments/:assignmentId/activate", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    if (!hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "Solo administracion puede activar asignaciones" });
    }

    const assignmentId = String(req.params.assignmentId || "").trim();
    const existing = await req.app.locals.store.getVehicleRouteAssignmentById(assignmentId);
    if (!existing || !canAccessTenantResource(req.user, { organizationId: existing.organizationId })) {
      return res.status(404).json({ ok: false, message: "Asignacion no encontrada" });
    }

    const vehicle = await getAccessibleVehicle(req, res, existing.vehicleId);
    if (!vehicle) return undefined;

    const organizationId = String(existing.organizationId || getOrganizationId(req.user)).trim();
    const result = await req.app.locals.store.activateVehicleRouteAssignment({
      organizationId,
      vehicleId: existing.vehicleId,
      assignmentId,
      actor: "admin",
      actorId: req.user.id,
      source: "admin",
      reason: req.body.reason || "admin_activated",
      expectedActiveAssignmentId: req.body.expectedActiveAssignmentId,
      expectedActivationVersion: req.body.expectedActivationVersion
    });

    if (result.outcome === "CONFLICT") {
      return respondAssignmentConflict(res, result.reason);
    }

    // Emision fisica del evento (§20) SOLO en ACTIVATED/RECONCILED (result.applied && result.event).
    if (result.applied && result.event) {
      const payload = { ...result.event, assignment: result.assignment, vehicle: minimalVehicleView(result.vehicle) };
      emitToRouteAudience(req, organizationId, "route-assignment:updated", payload, vehicle.driverId);
    }

    return res.json({
      ok: true,
      data: {
        outcome: result.outcome,
        applied: result.applied,
        assignment: result.assignment,
        vehicle: minimalVehicleView(result.vehicle)
      }
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
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para iniciar la jornada" });
    }
    const vehicleId = String(req.body.vehicleId || req.user.vehicleId || "").trim();
    const vehicle = await getAccessibleVehicle(req, res, vehicleId);
    if (!vehicle) return;
    if (!vehicle.driverId) return res.status(409).json({ ok: false, message: "La unidad no tiene chofer asignado" });
    if (req.user.role === "driver" && vehicle.driverId !== req.user.id) {
      return res.status(403).json({ ok: false, message: "Solo el chofer asignado puede iniciar la jornada" });
    }
    const session = await req.app.locals.store.createRouteSession({
      organizationId: String(vehicle.organizationId || getOrganizationId(req.user)).trim(),
      routeId: vehicle.routeId || (vehicle.assignedRoute
        ? `assigned:${vehicle.id}:${vehicle.assignedRoute.assignedAt || "current"}`
        : `recording:${vehicle.id}`),
      vehicleId,
      driverId: vehicle.driverId,
      startedAt: resolveSessionStartedAt(req.body.startedAt),
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
      emitToRouteAudience(req, session.organizationId, "route-session:updated", publicSession, session.driverId);
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
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para cambiar el estado de la jornada" });
    }
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
        void processCompletedRouteSession(req.app.locals.store, publicSession.id).catch(() => undefined);
      }
      emitToRouteAudience(req, session.organizationId, "route-session:updated", publicSession, session.driverId);
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
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageRoutes")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para registrar recorridos" });
    }
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

    emitToRouteAudience(
      req,
      String(tripLog.organizationId || getOrganizationId(req.user)).trim(),
      "navigation:trip-recorded",
      tripLog,
      vehicle.driverId
    );

    return res.status(201).json({
      ok: true,
      data: tripLog
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
