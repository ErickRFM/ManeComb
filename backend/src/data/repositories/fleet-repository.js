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
  "updateRoute"
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
  const activeVehicles = visibleFleet.filter((vehicle) => vehicle.status === "on-route");
  const averageOccupancy = activeVehicles.length
    ? Math.round(
        activeVehicles.reduce(
          (sum, vehicle) => sum + Number(vehicle.occupancy || 0) / Math.max(1, Number(vehicle.capacity || 1)),
          0
        ) * 100 / activeVehicles.length
      )
    : 0;
  const expiringDocuments = documents.filter(
    (document) => new Date(document.expiresAt).getTime() - Date.now() <= 14 * 24 * 60 * 60 * 1000
  );

  const metrics = [
    {
      id: "units-on-route",
      label: "Unidades activas",
      value: `${activeVehicles.length}/${visibleFleet.length}`,
      trend: "+1 vs ayer",
      tone: "positive"
    },
    {
      id: "punctuality",
      label: "Puntualidad",
      value: `${Math.max(84, 96 - openIncidents.length * 4)}%`,
      trend: openIncidents.length > 1 ? "Atencion en ruta R-21" : "Operacion estable",
      tone: openIncidents.length > 1 ? "warning" : "positive"
    },
    {
      id: "occupancy",
      label: "Aforo promedio",
      value: `${averageOccupancy}%`,
      trend: averageOccupancy > 75 ? "Carga alta en hora pico" : "Carga controlada",
      tone: averageOccupancy > 75 ? "warning" : "info"
    },
    {
      id: "documents",
      label: "Documentos urgentes",
      value: `${expiringDocuments.length}`,
      trend: "Requieren seguimiento",
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
      label: actor.shift,
      startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      nextCheckpointInMinutes: actor.role === "driver" ? 12 : 18
    }
  };
}

class FleetRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, FLEET_METHODS);
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
