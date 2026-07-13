const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const {
  canAccessTenantResource,
  getOrganizationId
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const { deliverOperationalNotification } = require("../../services/notification-delivery");

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

  if (vehicleId) {
    const vehicle = await req.app.locals.store.getVehicleById(vehicleId);

    if (
      !vehicle ||
      !canAccessTenantResource(req.user, vehicle) ||
      (req.user.role === "driver" && req.user.vehicleId !== vehicleId)
    ) {
      return res.status(404).json({
        ok: false,
        message: "Unidad no encontrada"
      });
    }
  }

  const incident = await req.app.locals.store.createIncident(req.user, {
    title,
    type,
    description,
    severity,
    vehicleId,
    routeId,
    location,
    media
  });

  const organizationId = String(incident.organizationId || getOrganizationId(req.user)).trim();
  req.app.locals.io?.to(`org:${organizationId}`).emit("incident:created", incident);

  const isSos = incident.severity === "critical" || /^sos/i.test(incident.title);
  const notification = await deliverOperationalNotification({
    io: req.app.locals.io,
    store: req.app.locals.store,
    payload: {
      title: isSos ? `SOS activo: ${incident.title}` : `Nueva incidencia: ${incident.title}`,
      body: `${req.user.name} reporto ${incident.type}. ${incident.description}`,
      level: isSos ? "critical" : incident.severity === "high" ? "warning" : "info",
      category: isSos ? "sos" : "incident",
      organizationId,
      targetRoles: ["admin", "supervisor"],
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
    req.app.locals.io?.to(`org:${organizationId}`).emit("incident:sos", {
      incident,
      notification
    });
  }

  return res.status(201).json({
    ok: true,
    data: incident
  });
});

router.patch("/:incidentId/status", authenticate, requireOperationalAccess, async (req, res) => {
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

  if (req.user.role === "driver" && currentIncident.reporterId !== req.user.id) {
    return res.status(403).json({
      ok: false,
      message: "No puedes actualizar una incidencia reportada por otro usuario"
    });
  }

  const incident = await req.app.locals.store.updateIncidentStatus(req.params.incidentId, status);

  if (!incident) {
    return res.status(404).json({
      ok: false,
      message: "Incidencia no encontrada"
    });
  }

  req.app.locals.io
    ?.to(`org:${String(incident.organizationId || getOrganizationId(req.user)).trim()}`)
    .emit("incident:updated", incident);

  await req.app.locals.store.recordAppEvent?.({
    type: "incident_status_updated",
    scope: "alerts",
    level: status === "resolved" ? "info" : "warning",
    status,
    userId: req.user.id,
    entityId: incident.id,
    message: `Incidencia ${incident.title} marcada como ${status}`
  });

  return res.json({
    ok: true,
    data: incident
  });
});

module.exports = router;
