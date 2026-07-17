const { INCIDENT_METHODS } = require("../data/repositories/incident-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class IncidentService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, INCIDENT_METHODS);
  }
}

module.exports = {
  IncidentService
};
