process.env.NODE_ENV = "test";
process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";

const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");

async function main() {
  const store = createEmbeddedStore();

  const adminA = await store.createUser({
    name: "Admin Alertas A",
    email: "alerts-boundary-admin-a@manecomb.test",
    password: "AlertsBoundary@123",
    role: "admin",
    accountType: "operations",
    organizationId: "alerts-boundary-a"
  });
  const adminB = await store.createUser({
    name: "Admin Alertas B",
    email: "alerts-boundary-admin-b@manecomb.test",
    password: "AlertsBoundary@123",
    role: "admin",
    accountType: "operations",
    organizationId: "alerts-boundary-b"
  });

  const incidentA = await store.createIncident(adminA, {
    title: "Incidencia A",
    type: "traffic",
    description: "Pertenece a A",
    severity: "medium"
  });
  const incidentB = await store.createIncident(adminB, {
    title: "Incidencia B",
    type: "traffic",
    description: "Pertenece a B",
    severity: "high"
  });

  const incidentsForA = await store.listIncidents(adminA);
  assert.ok(incidentsForA.some((incident) => incident.id === incidentA.id));
  assert.equal(incidentsForA.some((incident) => incident.id === incidentB.id), false);
  assert.ok(incidentsForA.every((incident) => incident.organizationId === "alerts-boundary-a"));

  const notificationA = await store.createNotification({
    organizationId: "alerts-boundary-a",
    title: "Aviso A",
    body: "Solo A",
    targetRoles: ["admin"]
  });
  const notificationB = await store.createNotification({
    organizationId: "alerts-boundary-b",
    title: "Aviso B",
    body: "Solo B",
    targetRoles: ["admin"]
  });

  const notificationsForA = await store.getNotificationsForUser(adminA);
  assert.ok(notificationsForA.some((notification) => notification.id === notificationA.id));
  assert.equal(notificationsForA.some((notification) => notification.id === notificationB.id), false);
  assert.ok(notificationsForA.every((notification) => notification.organizationId === "alerts-boundary-a"));

  const blockedRead = await store.markNotificationAsRead(notificationB.id, adminA.id);
  assert.equal(blockedRead, null);

  const allowedRead = await store.markNotificationAsRead(notificationA.id, adminA.id);
  assert.ok(allowedRead);
  assert.equal(allowedRead.id, notificationA.id);
  assert.equal(allowedRead.isRead === true || allowedRead.readBy?.includes(adminA.id), true);

  console.log("ok - incident and notification enterprise boundaries are tenant scoped");
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
