const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  canAccessTenantResource,
  getOrganizationId,
  getRolesWithPermission,
  requirePermission
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { deliverOperationalNotification } = require("../../services/notification-delivery");
const { resolveIncidentLocation } = require("../../services/incident-location");

const router = Router();

router.get("/", authenticate, requireOperationalAccess, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.listIncidents(req.user)
  });
});

router.post("/", authenticate, requireOperationalAccess, async (req, res) => {
  const { title, type, description, severity, vehicleId, routeId, location, media } = req.body;

  if (!title || !type || !description) {
    return res.status(400).json({
      ok: false,
      message: "title, type y description son obligatorios"
    });
  }

  const effectiveVehicleId = vehicleId || req.user.vehicleId || null;
  let vehicle = null;
  if (effectiveVehicleId) {
    vehicle = await req.app.locals.store.getVehicleById(effectiveVehicleId);

    if (
      !vehicle ||
      !canAccessTenantResource(req.user, vehicle) ||
      (req.user.role === "driver" && req.user.vehicleId !== effectiveVehicleId)
    ) {
      return res.status(404).json({
        ok: false,
        message: "Unidad no encontrada"
      });
    }
  }

  const incidentLocation = resolveIncidentLocation(vehicle, location);

  const incident = await req.app.locals.store.createIncident(req.user, {
    title,
    type,
    description,
    severity,
    vehicleId: effectiveVehicleId,
    routeId,
    ...incidentLocation,
    media
  });

  const organizationId = String(incident.organizationId || getOrganizationId(req.user)).trim();
  const incidentManagerRoles = getRolesWithPermission("canManageIncidents");
  incidentManagerRoles.forEach((role) => {
    req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit("incident:created", incident);
  });
  req.app.locals.io?.to("platform:admin").emit("incident:created", incident);

  const isSos = incident.severity === "critical" || /^sos\b/i.test(incident.title);
  const notification = await deliverOperationalNotification({
    io: req.app.locals.io,
    store: req.app.locals.store,
    payload: {
      title: isSos ? `SOS activo: ${incident.title}` : `Nueva incidencia: ${incident.title}`,
      body: `${req.user.name} reporto ${incident.type}. ${incident.description}`,
      level: isSos ? "critical" : incident.severity === "high" ? "warning" : "info",
      category: isSos ? "sos" : "incident",
      organizationId,
      targetRoles: incidentManagerRoles,
      data: {
        incidentId: incident.id,
        severity: incident.severity,
        vehicleId: incident.vehicleId,
        routeId: incident.routeId,
        type: incident.type
      },
      deepLink: `/incidencias?incidentId=${encodeURIComponent(incident.id)}${isSos ? "&focus=sos" : ""}`
    }
  });

  if (isSos) {
    incidentManagerRoles.forEach((role) => {
      req.app.locals.io?.to(`org:${organizationId}:role:${role}`).emit("incident:sos", {
        incident,
        notification
      });
    });
    req.app.locals.io?.to("platform:admin").emit("incident:sos", { incident, notification });
  }

  return res.status(201).json({
    ok: true,
    data: incident
  });
});

router.patch("/:incidentId/status", authenticate, requireOperationalAccess, requirePermission("canManageIncidents"), async (req, res) => {
  const { status } = req.body;

  if (!["open", "in_progress", "resolved"].includes(status)) {
    return res.status(400).json({
      ok: false,
      message: "Estatus invalido"
    });
  }

  const currentIncident = (await req.app.locals.store.listIncidents(req.user)).find(
    (entry) => entry.id === req.params.incidentId
  );

  if (!currentIncident) {
    return res.status(404).json({
      ok: false,
      message: "Incidencia no encontrada"
    });
  }

  if (currentIncident.status === status) {
    return res.json({
      ok: true,
      idempotent: true,
      data: currentIncident
    });
  }

  const incident = await req.app.locals.store.transitionIncidentStatus({
    incidentId: req.params.incidentId,
    organizationId: getOrganizationId(req.user),
    expectedStatus: currentIncident.status,
    nextStatus: status
  });

  if (!incident) {
    return res.status(409).json({
      ok: false,
      code: "INCIDENT_CONCURRENT_UPDATE",
      message: "La incidencia cambio mientras la estabas actualizando. Recarga su estado e intenta nuevamente."
    });
  }

  const incidentOrganizationId = String(incident.organizationId || getOrganizationId(req.user)).trim();
  getRolesWithPermission("canManageIncidents").forEach((role) => {
    req.app.locals.io?.to(`org:${incidentOrganizationId}:role:${role}`).emit("incident:updated", incident);
  });
  req.app.locals.io?.to(`user:${incident.reporterId}`).emit("incident:updated", incident);
  req.app.locals.io?.to("platform:admin").emit("incident:updated", incident);

  await req.app.locals.store.recordAppEvent?.({
    type: "incident_status_updated",
    scope: "alerts",
    level: status === "resolved" ? "info" : "warning",
    status,
    userId: req.user.id,
    entityId: incident.id,
    message: `Incidencia ${incident.title} marcada como ${status}`,
    metadata: {
      previousStatus: currentIncident.status,
      organizationId: incidentOrganizationId
    }
  });

  return res.json({
    ok: true,
    data: incident
  });
});

module.exports = router;
