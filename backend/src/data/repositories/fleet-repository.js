const { StoreDomainRepository } = require("./store-domain-repository");

const FLEET_METHODS = [
  "createVehicle",
  "deleteUnusedVehicle",
  "getDashboardOverview",
  "getVehicleLifecycleDependencies",
  "getOperationalInsights",
  "getVehicleById",
  "listVehiclesForOrganization",
  "retireVehicle"
];

class FleetRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, FLEET_METHODS);
  }
}

module.exports = {
  FLEET_METHODS,
  FleetRepository
};
