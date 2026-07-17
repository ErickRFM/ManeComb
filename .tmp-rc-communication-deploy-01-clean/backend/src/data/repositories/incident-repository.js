const { StoreDomainRepository } = require("./store-domain-repository");

const INCIDENT_METHODS = [
  "createIncident",
  "listIncidents",
  "updateIncidentStatus"
];

class IncidentRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, INCIDENT_METHODS);
  }
}

module.exports = {
  INCIDENT_METHODS,
  IncidentRepository
};
