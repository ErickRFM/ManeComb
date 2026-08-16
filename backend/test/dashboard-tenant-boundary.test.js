process.env.NODE_ENV = "test";
process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEmbeddedStore } = require("../src/data/store");

async function main() {
  const store = createEmbeddedStore();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const adminA = await store.createUser({
    name: "Dashboard Admin A",
    email: "dashboard-boundary-admin-a@manecomb.test",
    password: "DashboardBoundary@123",
    role: "admin",
    accountType: "operations",
    organizationId: "dashboard-boundary-a"
  });
  const adminB = await store.createUser({
    name: "Dashboard Admin B",
    email: "dashboard-boundary-admin-b@manecomb.test",
    password: "DashboardBoundary@123",
    role: "admin",
    accountType: "operations",
    organizationId: "dashboard-boundary-b"
  });

  const vehicleA = await store.createVehicle({
    code: "DASH-A",
    plate: "DASH-A",
    organizationId: "dashboard-boundary-a",
    status: "available"
  });
  const vehicleB = await store.createVehicle({
    code: "DASH-B-SECRET",
    plate: "DASH-B",
    organizationId: "dashboard-boundary-b",
    status: "available"
  });

  await store.createIncident(adminA, {
    title: "Incidencia visible A",
    type: "traffic",
    description: "Solo tenant A",
    severity: "medium",
    vehicleId: vehicleA.id
  });
  await store.createIncident(adminB, {
    title: "INCIDENT-B-SECRET",
    type: "traffic",
    description: "No debe viajar a A",
    severity: "critical",
    vehicleId: vehicleB.id
  });

  await store.createDocument({
    organizationId: "dashboard-boundary-a",
    ownerType: "vehicle",
    ownerId: vehicleA.id,
    name: "Documento visible A",
    expiresAt: tomorrow
  });
  await store.createDocument({
    organizationId: "dashboard-boundary-b",
    ownerType: "vehicle",
    ownerId: vehicleB.id,
    name: "DOCUMENT-B-SECRET",
    expiresAt: tomorrow
  });

  await store.createNotification({
    organizationId: "dashboard-boundary-a",
    title: "Aviso visible A",
    body: "Tenant A",
    targetRoles: ["admin"]
  });
  await store.createNotification({
    organizationId: "dashboard-boundary-b",
    title: "NOTIFICATION-B-SECRET",
    body: "Tenant B",
    targetRoles: ["admin"]
  });

  const dashboard = await store.getDashboardOverview(adminA);
  assert.deepEqual(dashboard.fleet.map((vehicle) => vehicle.id), [vehicleA.id]);
  assert.ok(dashboard.alerts.some((alert) => alert.label === "Incidencia visible A"));
  assert.ok(dashboard.alerts.some((alert) => alert.label === "Documento visible A"));
  assert.ok(dashboard.notifications.some((notification) => notification.title === "Aviso visible A"));

  const documentsMetric = dashboard.metrics.find((metric) => metric.id === "documents");
  assert.equal(documentsMetric.value, "1");
  assert.equal(documentsMetric.trend, "1 requieren seguimiento");

  const incidentsMetric = dashboard.metrics.find((metric) => metric.id === "incidents-open");
  assert.equal(incidentsMetric.value, "1");
  assert.equal(incidentsMetric.trend, "1 pendientes");

  const maintenanceMetric = dashboard.metrics.find((metric) => metric.id === "maintenance");
  assert.equal(maintenanceMetric.value, "0");
  assert.equal(maintenanceMetric.trend, "Sin unidades en mantenimiento");

  assert.equal(dashboard.shift.startedAt, null);
  assert.equal(dashboard.shift.nextCheckpointInMinutes, null);

  const repositorySource = fs.readFileSync(
    path.join(__dirname, "../src/data/repositories/fleet-repository.js"),
    "utf8"
  );
  for (const fabricatedSignal of [
    "+1 vs ayer",
    "Atencion en ruta R-21",
    "96 - openIncidents.length",
    "Date.now() - 3 * 60 * 60 * 1000",
    "actor.role === \"driver\" ? 12 : 18"
  ]) {
    assert.equal(
      repositorySource.includes(fabricatedSignal),
      false,
      `dashboard must not fabricate operational signal: ${fabricatedSignal}`
    );
  }

  const serialized = JSON.stringify(dashboard);
  for (const foreignSecret of [
    "DASH-B-SECRET",
    "INCIDENT-B-SECRET",
    "DOCUMENT-B-SECRET",
    "NOTIFICATION-B-SECRET"
  ]) {
    assert.equal(serialized.includes(foreignSecret), false, `dashboard leaked ${foreignSecret}`);
  }

  console.log("ok - dashboard is tenant-scoped and presents persisted facts only");
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
