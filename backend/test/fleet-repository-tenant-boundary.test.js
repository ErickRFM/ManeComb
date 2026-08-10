process.env.NODE_ENV = "test";
process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";

const assert = require("node:assert/strict");
const { createEmbeddedStore } = require("../src/data/store");

async function main() {
  const store = createEmbeddedStore();

  const adminA = await store.createUser({
    name: "Admin Rutas A",
    email: "route-boundary-admin-a@manecomb.test",
    password: "RouteBoundary@123",
    role: "admin",
    accountType: "operations",
    organizationId: "route-boundary-a"
  });

  const routeA = await store.createRoute({
    name: "Ruta segura A",
    code: "RA",
    organizationId: "route-boundary-a"
  });
  const routeB = await store.createRoute({
    name: "Ruta protegida B",
    code: "RB",
    organizationId: "route-boundary-b"
  });

  const scoped = await store.listRoutes(adminA);
  assert.ok(scoped.some((route) => route.id === routeA.id));
  assert.equal(scoped.some((route) => route.id === routeB.id), false);
  assert.ok(scoped.every((route) => route.organizationId === "route-boundary-a"));

  const blockedUpdate = await store.updateRoute(routeB.id, { name: "MUTACION ILEGAL" }, adminA);
  assert.equal(blockedUpdate, null);
  assert.equal((await store.getRouteById(routeB.id)).name, "Ruta protegida B");

  const blockedDelete = await store.deleteRoute(routeB.id, adminA);
  assert.equal(blockedDelete, null);
  assert.ok(await store.getRouteById(routeB.id));

  const allowedUpdate = await store.updateRoute(routeA.id, { name: "Ruta A actualizada" }, adminA);
  assert.equal(allowedUpdate.name, "Ruta A actualizada");

  const globalInventory = await store.listRoutes(null);
  assert.ok(globalInventory.some((route) => route.id === routeA.id));
  assert.ok(globalInventory.some((route) => route.id === routeB.id));

  console.log("ok - enterprise route reads and mutations are tenant scoped");
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
