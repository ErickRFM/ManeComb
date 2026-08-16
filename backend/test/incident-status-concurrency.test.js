process.env.NODE_ENV = "test";
process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";

const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");

async function main() {
  const store = createEmbeddedStore();
  const organizationId = `incident-cas-${Date.now()}`;
  const admin = await store.createUser({
    name: "Incident CAS Admin",
    email: `incident-cas-${Date.now()}@manecomb.test`,
    password: "Ruta123!",
    role: "admin",
    accountType: "operations",
    organizationId,
    userStatus: "active",
    status: "offline"
  });
  const vehicle = await store.createVehicle({
    code: "CAS-1",
    plate: "CAS-001",
    organizationId,
    status: "available"
  });
  const incident = await store.createIncident(admin, {
    title: "Concurrent state",
    type: "traffic",
    description: "Optimistic transition contract",
    severity: "medium",
    vehicleId: vehicle.id
  });

  assert.equal(incident.status, "open");

  const first = await store.transitionIncidentStatus({
    incidentId: incident.id,
    organizationId,
    expectedStatus: "open",
    nextStatus: "in_progress"
  });
  assert.equal(first.status, "in_progress");

  const staleWriter = await store.transitionIncidentStatus({
    incidentId: incident.id,
    organizationId,
    expectedStatus: "open",
    nextStatus: "resolved"
  });
  assert.equal(staleWriter, null, "a stale writer must not overwrite a newer incident state");

  const persisted = (await store.listIncidents(admin)).find((entry) => entry.id === incident.id);
  assert.equal(persisted.status, "in_progress");

  const second = await store.transitionIncidentStatus({
    incidentId: incident.id,
    organizationId,
    expectedStatus: "in_progress",
    nextStatus: "resolved"
  });
  assert.equal(second.status, "resolved");

  console.log("ok - incident status updates use optimistic concurrency");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
