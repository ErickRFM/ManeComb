const { IncidentModel } = require("../models");
const { StoreDomainRepository } = require("./store-domain-repository");
const { getEnterpriseOrganizationId, mapMaybePromise } = require("./tenant-repository-utils");

const INCIDENT_METHODS = [
  "createIncident",
  "listIncidents",
  "transitionIncidentStatus",
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

function toPlain(document) {
  if (!document) return null;
  const source = typeof document.toObject === "function" ? document.toObject() : { ...document };
  const { _id, __v, ...rest } = source;
  return { id: source.id || _id, ...rest };
}

class IncidentRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, INCIDENT_METHODS);
    this.IncidentModel = IncidentModel;
  }

  listIncidents(actor = null) {
    return mapMaybePromise(
      this.store.listIncidents(actor),
      (incidents) => scopeIncidentsToEnterpriseActor(incidents, actor)
    );
  }

  async transitionIncidentStatus({ incidentId, organizationId, expectedStatus, nextStatus }) {
    const safeIncidentId = String(incidentId || "").trim();
    const safeOrganizationId = String(organizationId || "").trim();
    const safeExpectedStatus = String(expectedStatus || "").trim();
    const safeNextStatus = String(nextStatus || "").trim();
    if (!safeIncidentId || !safeOrganizationId || !safeExpectedStatus || !safeNextStatus) return null;

    if (this.IncidentModel?.db?.readyState === 1) {
      const query = this.IncidentModel.findOneAndUpdate(
        {
          _id: safeIncidentId,
          organizationId: safeOrganizationId,
          status: safeExpectedStatus
        },
        {
          $set: {
            status: safeNextStatus,
            updatedAt: new Date()
          }
        },
        { returnDocument: "after" }
      );
      const document = typeof query?.lean === "function" ? await query.lean() : await query;
      return toPlain(document);
    }

    // El adapter embebido es de un solo proceso y se usa en pruebas/desarrollo.
    // Conserva el mismo token optimista aunque no tenga una primitiva Mongo CAS.
    const systemActor = { id: "system", role: "owner", organizationId: safeOrganizationId };
    const current = (await Promise.resolve(this.store.listIncidents(systemActor))).find(
      (incident) => String(incident.id || incident._id || "") === safeIncidentId
    );
    if (!current || String(current.status || "") !== safeExpectedStatus) return null;
    return this.store.updateIncidentStatus(safeIncidentId, safeNextStatus);
  }
}

module.exports = {
  INCIDENT_METHODS,
  IncidentRepository,
  scopeIncidentsToEnterpriseActor,
  toPlain
};
