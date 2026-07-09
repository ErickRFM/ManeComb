const { TRACKING_METHODS } = require("../data/repositories/tracking-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class TrackingService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, TRACKING_METHODS);
  }
}

module.exports = {
  TrackingService
};
