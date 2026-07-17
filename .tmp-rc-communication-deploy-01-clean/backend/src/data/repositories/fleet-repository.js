const { StoreDomainRepository } = require("./store-domain-repository");

const FLEET_METHODS = [
  "createVehicle",
  "getDashboardOverview",
  "getOperationalInsights",
  "getVehicleById"
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
