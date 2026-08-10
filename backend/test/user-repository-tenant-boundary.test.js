process.env.NODE_ENV = "test";
process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";

const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");

async function main() {
  const store = createEmbeddedStore();

  const adminA = await store.createUser({
    name: "Admin Operativo A",
    email: "tenant-boundary-admin-a@manecomb.test",
    password: "TenantBoundary@123",
    role: "admin",
    accountType: "operations",
    organizationId: "tenant-boundary-a"
  });
  const supervisorA = await store.createUser({
    name: "Supervisor A",
    email: "tenant-boundary-supervisor-a@manecomb.test",
    password: "TenantBoundary@123",
    role: "supervisor",
    accountType: "operations",
    organizationId: "tenant-boundary-a"
  });
  const supervisorB = await store.createUser({
    name: "Supervisor B",
    email: "tenant-boundary-supervisor-b@manecomb.test",
    password: "TenantBoundary@123",
    role: "supervisor",
    accountType: "operations",
    organizationId: "tenant-boundary-b"
  });

  const scoped = await store.listUsers(adminA);
  assert.ok(scoped.some((entry) => entry.id === adminA.id));
  assert.ok(scoped.some((entry) => entry.id === supervisorA.id));
  assert.equal(scoped.some((entry) => entry.id === supervisorB.id), false);
  assert.ok(scoped.every((entry) => entry.organizationId === "tenant-boundary-a"));

  const globalPlatformInventory = await store.listUsers(null);
  assert.ok(globalPlatformInventory.some((entry) => entry.id === adminA.id));
  assert.ok(globalPlatformInventory.some((entry) => entry.id === supervisorA.id));
  assert.ok(globalPlatformInventory.some((entry) => entry.id === supervisorB.id));

  const missingTenantActor = { ...adminA, organizationId: null, companyId: null };
  assert.deepEqual(await store.listUsers(missingTenantActor), []);

  console.log("ok - enterprise listUsers is tenant scoped; only explicit Platform null actor is global");
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
