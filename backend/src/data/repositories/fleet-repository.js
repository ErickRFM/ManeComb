const { StoreDomainRepository } = require("./store-domain-repository");

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

function getEnterpriseOrganizationId(user) {
  return String(user?.organizationId || user?.companyId || "").trim();
}

function canActorAccessRoute(actor, route) {
  if (!actor) return true;
  const organizationId = getEnterpriseOrganizationId(actor);
  if (!organizationId || !route) return false;
  return String(route.organizationId || "").trim() === organizationId;
}

class FleetRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, FLEET_METHODS);
  }

  async listRoutes(actor = null) {
    const routes = await Promise.resolve(this.store.listRoutes(actor));
    if (!Array.isArray(routes)) return [];
    if (!actor) return routes;

    const organizationId = getEnterpriseOrganizationId(actor);
    if (!organizationId) return [];
    return routes.filter(
      (route) => String(route?.organizationId || "").trim() === organizationId
    );
  }

  async updateRoute(routeId, payload, actor = null) {
    if (actor) {
      const current = await Promise.resolve(this.store.getRouteById(routeId));
      if (!canActorAccessRoute(actor, current)) return null;
    }

    return Promise.resolve(this.store.updateRoute(routeId, payload, actor));
  }

  async deleteRoute(routeId, actor = null) {
    if (actor) {
      const current = await Promise.resolve(this.store.getRouteById(routeId));
      if (!canActorAccessRoute(actor, current)) return null;
    }

    return Promise.resolve(this.store.deleteRoute(routeId, actor));
  }
}

module.exports = {
  FLEET_METHODS,
  FleetRepository,
  canActorAccessRoute,
  getEnterpriseOrganizationId
};
