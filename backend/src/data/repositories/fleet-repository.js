const { StoreDomainRepository } = require("./store-domain-repository");
const {
  getEnterpriseOrganizationId,
  isSameEnterpriseOrganization,
  mapMaybePromise
} = require("./tenant-repository-utils");

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
}

module.exports = {
  FLEET_METHODS,
  FleetRepository,
  canActorAccessRoute
};
