const { FLEET_METHODS } = require("../data/repositories/fleet-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class FleetService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, FLEET_METHODS);
  }
}

module.exports = {
  FleetService
};
