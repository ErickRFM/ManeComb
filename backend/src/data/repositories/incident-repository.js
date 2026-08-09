const { StoreDomainRepository } = require("./store-domain-repository");

const INCIDENT_METHODS = [
  "createIncident",
  "listIncidents",
  "updateIncidentStatus"
];

function getEnterpriseOrganizationId(user) {
  return String(user?.organizationId || user?.companyId || "").trim();
}

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

  async listIncidents(actor = null) {
    const incidents = await Promise.resolve(this.store.listIncidents(actor));
    return scopeIncidentsToEnterpriseActor(incidents, actor);
  }
}

module.exports = {
  INCIDENT_METHODS,
  IncidentRepository,
  getEnterpriseOrganizationId,
  scopeIncidentsToEnterpriseActor
};
