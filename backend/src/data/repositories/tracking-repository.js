const { StoreDomainRepository } = require("./store-domain-repository");

const TRACKING_METHODS = [
  "assignRouteToVehicle",
  "clearAssignedRouteFromVehicle",
  "createTripLog",
  "getLiveLocations",
  "getVehicleById",
  "listTripLogs",
  "updateVehicleLocation"
];

class TrackingRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, TRACKING_METHODS);
  }
}

module.exports = {
  TRACKING_METHODS,
  TrackingRepository
};
