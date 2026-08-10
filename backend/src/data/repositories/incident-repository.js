const { StoreDomainRepository } = require("./store-domain-repository");
const { getEnterpriseOrganizationId, mapMaybePromise } = require("./tenant-repository-utils");

const INCIDENT_METHODS = [
  "createIncident",
  "listIncidents",
  "updateIncidentStatus"
];

function scopeIncidentsToEnterpriseActor(incidents, actor) {
  const items = Array.isArray(incidents) ? incidents : [];
  if (!actor) return items;

  const organizationId = getEnterpriseOrganizationId(actor);
  if (!organizationId) return [];

  return items.filter((incident) => {
    if (String(incident?.organizationId || "").trim() !== organizationId) {
      return false;
    }

    if (actor.role !== "driver") {
      return true;
    }

    return (
      String(incident?.reporterId || "") === String(actor.id || "") ||
      (actor.vehicleId && String(incident?.vehicleId || "") === String(actor.vehicleId))
    );
  });
}

class IncidentRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, INCIDENT_METHODS);
  }

  listIncidents(actor = null) {
    return mapMaybePromise(
      this.store.listIncidents(actor),
      (incidents) => scopeIncidentsToEnterpriseActor(incidents, actor)
    );
  }
}

module.exports = {
  INCIDENT_METHODS,
  IncidentRepository,
  scopeIncidentsToEnterpriseActor
};
