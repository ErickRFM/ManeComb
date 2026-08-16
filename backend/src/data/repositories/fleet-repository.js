const { randomUUID } = require("crypto");
const { StoreDomainRepository } = require("./store-domain-repository");
const {
  getEnterpriseOrganizationId,
  isSameEnterpriseOrganization,
  mapMaybePromise
} = require("./tenant-repository-utils");
const { scopeIncidentsToEnterpriseActor } = require("./incident-repository");
const { scopeNotificationsToEnterpriseUser } = require("./notification-repository");

const FLEET_METHODS = [
  "createVehicle",
  "deleteRoute",
  "deleteUnusedVehicle",
  "getDashboardOverview",
  "getVehicleLifecycleDependencies",
  "getOperationalInsights",
  "getVehicleById",
  "listRoutes",
  "listVehiclesForOrganization",
  "retireVehicle",
  "updateRoute",
  "updateRouteIfRevision"
];

function canActorAccessRoute(actor, route) {
  return !actor || isSameEnterpriseOrganization(actor, route);
}

function buildDashboardAlert(label, tone, meta) {
  return {
    id: randomUUID(),
    label,
    tone,
    ...meta
  };
}

function getDashboardHero(role) {
  const heroes = {
    admin: {
      eyebrow: "Centro de control",
      title: "Visibilidad total de la flotilla en un vistazo",
      description: "Monitorea unidades, incidencias y documentos con una sola consola movil."
    },
    supervisor: {
      eyebrow: "Operacion en campo",
      title: "Prioriza retrasos, bloqueos y checklist criticos",
      description: "Resuelve incidencias antes de que peguen en el servicio."
    },
    driver: {
      eyebrow: "Cabina",
      title: "Tu turno, tu ruta y tu respaldo operativo",
      description: "Consulta tu avance, reporta incidencias y mantente comunicado sin distraerte."
    }
  };

  return heroes[role] || heroes.admin;
}

function buildTenantDashboard({ actor, fleet, incidents, documents, notifications }) {
  const visibleFleet = actor.role === "driver"
    ? fleet.filter((vehicle) => String(vehicle.id) === String(actor.vehicleId || ""))
    : fleet;
  const openIncidents = incidents.filter((incident) => incident.status !== "resolved");
  const criticalIncidents = openIncidents.filter((incident) => incident.severity === "critical");
  const incidentsInProgress = openIncidents.filter((incident) => incident.status === "in_progress");
  const activeVehicles = visibleFleet.filter((vehicle) => vehicle.status === "on-route");
  const maintenanceVehicles = visibleFleet.filter((vehicle) => vehicle.status === "maintenance");
  const expiringDocuments = documents.filter((document) => {
    const expiresAt = new Date(document.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt - Date.now() <= 14 * 24 * 60 * 60 * 1000;
  });

  // El dashboard solo presenta hechos derivados del estado persistido actual.
  // No se fabrican tendencias historicas, puntualidad, aforo ni tiempos de
  // jornada cuando no existe una fuente de datos que los respalde.
  const metrics = [
    {
      id: "units-on-route",
      label: "Unidades activas",
      value: `${activeVehicles.length}/${visibleFleet.length}`,
      trend: activeVehicles.length
        ? `${activeVehicles.length} en ruta ahora`
        : "Sin unidades en ruta",
      tone: activeVehicles.length ? "positive" : "info"
    },
    {
      id: "incidents-open",
      label: "Incidencias abiertas",
      value: `${openIncidents.length}`,
      trend: criticalIncidents.length
        ? `${criticalIncidents.length} criticas`
        : incidentsInProgress.length
          ? `${incidentsInProgress.length} en atencion`
          : openIncidents.length
            ? `${openIncidents.length} pendientes`
            : "Sin incidencias abiertas",
      tone: criticalIncidents.length
        ? "danger"
        : openIncidents.length
          ? "warning"
          : "positive"
    },
    {
      id: "maintenance",
      label: "En mantenimiento",
      value: `${maintenanceVehicles.length}`,
      trend: maintenanceVehicles.length
        ? `${maintenanceVehicles.length} fuera de operacion`
        : "Sin unidades en mantenimiento",
      tone: maintenanceVehicles.length ? "warning" : "positive"
    },
    {
      id: "documents",
      label: "Documentos urgentes",
      value: `${expiringDocuments.length}`,
      trend: expiringDocuments.length
        ? `${expiringDocuments.length} requieren seguimiento`
        : "Sin vencimientos proximos",
      tone: expiringDocuments.length ? "danger" : "positive"
    }
  ];

  const alerts = [
    ...openIncidents.map((incident) =>
      buildDashboardAlert(incident.title, incident.severity, {
        subtitle: incident.description,
        status: incident.status
      })
    ),
    ...expiringDocuments.slice(0, 2).map((document) =>
      buildDashboardAlert(document.name, document.status === "vencido" ? "danger" : "warning", {
        subtitle: `Vence ${new Date(document.expiresAt).toLocaleDateString("es-MX")}`,
        status: document.status
      })
    )
  ].slice(0, 5);

  return {
    hero: getDashboardHero(actor.role),
    metrics,
    fleet: visibleFleet,
    alerts,
    notifications: notifications.slice(0, 4),
    shift: {
      label: actor.shift || null,
      startedAt: null,
      nextCheckpointInMinutes: null
    }
  };
}

class FleetRepository extends StoreDomainRepository {
  constructor(store, models = {}) {
    super(store, FLEET_METHODS.filter((method) => method !== "updateRouteIfRevision"));
    this.models = models;
  }

  listRoutes(actor = null) {
    return mapMaybePromise(this.store.listRoutes(actor), (routes) => {
      if (!Array.isArray(routes)) return [];
      if (!actor) return routes;

      const organizationId = getEnterpriseOrganizationId(actor);
      if (!organizationId) return [];
      return routes.filter(
        (route) => String(route?.organizationId || "").trim() === organizationId
      );
    });
  }

  updateRoute(routeId, payload, actor = null) {
    if (!actor) {
      return this.store.updateRoute(routeId, payload, actor);
    }

    return mapMaybePromise(this.store.getRouteById(routeId), (current) => {
      if (!canActorAccessRoute(actor, current)) return null;
      return this.store.updateRoute(routeId, payload, actor);
    });
  }

  async updateRouteIfRevision(routeId, expectedRevision, payload, actor = null) {
    const current = await Promise.resolve(this.store.getRouteById(routeId));
    if (!current || !canActorAccessRoute(actor, current)) return null;
    if (Number(current.revision) !== Number(expectedRevision)) return null;

    const RouteModel = this.models.RouteModel;
    if (RouteModel?.db?.readyState === 1) {
      const query = RouteModel.findOneAndUpdate(
        {
          _id: routeId,
          organizationId: current.organizationId,
          revision: Number(expectedRevision)
        },
        {
          $set: {
            ...payload,
            revision: Number(expectedRevision) + 1,
            updatedAt: new Date()
          }
        },
        { returnDocument: "after" }
      );
      const atomic = typeof query?.lean === "function" ? await query.lean() : await query;
      if (!atomic) return null;

      // El documento retornado por el CAS es la autoridad de esta mutacion. El
      // refresh puede observar una revision posterior de otro writer y debe
      // reconciliar esa proyeccion, pero nunca reemplazar ni invalidar el
      // resultado ya comprometido por este CAS.
      //
      // `updateRoute({}, actor)` es deliberadamente no-op para Route; su adapter
      // refresca Vehicle.assignedRoute desde la Route canonica mas reciente.
      try {
        await this.store.updateRoute(routeId, {}, actor);
      } catch (_projectionError) {
        // La reparacion de una proyeccion derivada no revierte un CAS Mongo ya
        // confirmado. La siguiente reconciliacion puede reintentar el refresh.
      }
      return atomic;
    }

    // Embedded/test adapter: one process, same optimistic token, same canonical writer.
    const latest = await Promise.resolve(this.store.getRouteById(routeId));
    if (!latest || Number(latest.revision) !== Number(expectedRevision)) return null;
    return this.store.updateRoute(routeId, payload, actor);
  }

  deleteRoute(routeId, actor = null) {
    if (!actor) {
      return this.store.deleteRoute(routeId, actor);
    }

    return mapMaybePromise(this.store.getRouteById(routeId), (current) => {
      if (!canActorAccessRoute(actor, current)) return null;
      return this.store.deleteRoute(routeId, actor);
    });
  }

  async getDashboardOverview(actor) {
    if (!actor) {
      return Promise.resolve(this.store.getDashboardOverview(actor));
    }

    const organizationId = getEnterpriseOrganizationId(actor);
    if (!organizationId) {
      return buildTenantDashboard({ actor, fleet: [], incidents: [], documents: [], notifications: [] });
    }

    const [fleet, rawIncidents, documents, rawNotifications] = await Promise.all([
      Promise.resolve(this.store.listVehiclesForOrganization(organizationId, { includeRetired: false })),
      Promise.resolve(this.store.listIncidents(actor)),
      Promise.resolve(this.store.listDocuments({ organizationId })),
      Promise.resolve(this.store.getNotificationsForUser(actor))
    ]);

    return buildTenantDashboard({
      actor,
      fleet: Array.isArray(fleet) ? fleet.filter((vehicle) => isSameEnterpriseOrganization(actor, vehicle)) : [],
      incidents: scopeIncidentsToEnterpriseActor(rawIncidents, actor),
      documents: Array.isArray(documents)
        ? documents.filter((document) => isSameEnterpriseOrganization(actor, document))
        : [],
      notifications: scopeNotificationsToEnterpriseUser(rawNotifications, actor)
    });
  }
}

module.exports = {
  FLEET_METHODS,
  FleetRepository,
  buildTenantDashboard,
  canActorAccessRoute,
  getDashboardHero
};
