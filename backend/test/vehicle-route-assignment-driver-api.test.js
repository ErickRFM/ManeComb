// RC-MULTI-ROUTE-DRIVER-01 F5 — API driver de asignaciones.
// GET /assignments/mine (con flag selectable) + POST /assignments/:id/select (actor=driver).
// Integracion HTTP sobre el store embedded, con la unidad de seed vehicle-101 / user-driver-01.

const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");

function routePayload(id, organizationId, createdBy) {
  return {
    id, organizationId, name: id, code: id, color: "#1473E6",
    origin: { latitude: 19.415, longitude: -99.073 }, destination: { latitude: 19.4452, longitude: -99.1513 },
    originLabel: "A", destinationLabel: "B", stops: [],
    distanceMeters: 1000, durationSeconds: 600, durationInTrafficSeconds: 600,
    polyline: [{ latitude: 19.415, longitude: -99.073 }, { latitude: 19.4452, longitude: -99.1513 }],
    createdBy
  };
}

async function createContext() {
  const store = createEmbeddedStore();
  const admin = store.getUserById("user-admin-01");
  const driver = store.getUserById("user-driver-01"); // vehicleId: vehicle-101 (driverId=user-driver-01)
  const organizationId = admin.organizationId;
  store.createRoute(routePayload("f5-route-1", organizationId, admin.id));

  // Admin crea asignaciones para la unidad del conductor (vehicle-101).
  const open = store.createVehicleRouteAssignment({ organizationId, vehicleId: "vehicle-101", routeId: "f5-route-1", assignedBy: admin.id });
  const locked = store.createVehicleRouteAssignment({ organizationId, vehicleId: "vehicle-101", routeId: "f5-route-1", selectableByDriver: false, assignedBy: admin.id });
  // Asignacion de OTRA unidad (vehicle-204 / user-driver-02) para probar aislamiento.
  const foreign = store.createVehicleRouteAssignment({ organizationId, vehicleId: "vehicle-204", routeId: "f5-route-1", assignedBy: admin.id });

  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    store, organizationId, openId: open.id, lockedId: locked.id, foreignId: foreign.id,
    driverToken: signToken(driver),
    url: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  };
}

async function request(ctx, path, method = "GET", body, token = ctx.driverToken) {
  const response = await fetch(`${ctx.url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

(async () => {
  const ctx = await createContext();
  try {
    // --- GET /assignments/mine (usa req.user.vehicleId por defecto) ---
    const mine = await request(ctx, "/navigation/assignments/mine");
    assert.equal(mine.status, 200, "GET /assignments/mine -> 200");
    const openItem = mine.data.data.find((a) => a.id === ctx.openId);
    const lockedItem = mine.data.data.find((a) => a.id === ctx.lockedId);
    assert.ok(openItem && lockedItem, "mine incluye las asignaciones de la unidad del conductor");
    assert.ok(!mine.data.data.some((a) => a.id === ctx.foreignId), "mine NO incluye asignaciones de otra unidad");
    assert.equal(openItem.selectable, true, "abierta: selectable true");
    assert.equal(lockedItem.selectable, false, "bloqueada: selectable false");
    assert.equal(lockedItem.selectableReason, "admin_locked", "bloqueada: motivo admin_locked");
    console.log("ok - F5 API: /assignments/mine anota selectable + aislamiento por unidad");

    // --- select de una asignacion NO seleccionable -> admin_locked (409) ---
    // (antes de activar ninguna: sin otra ACTIVE, el motor llega a la guarda selectableByDriver)
    const lockedSelect = await request(ctx, `/navigation/assignments/${ctx.lockedId}/select`, "POST", {});
    assert.equal(lockedSelect.status, 409, "select bloqueada -> 409");
    assert.equal(lockedSelect.data.code, "admin_locked", "code admin_locked");
    console.log("ok - F5 API: selectableByDriver=false -> admin_locked (409)");

    // --- POST /assignments/:id/select (auto-activacion del conductor) ---
    const selected = await request(ctx, `/navigation/assignments/${ctx.openId}/select`, "POST", {});
    assert.equal(selected.status, 200, "select abierta -> 200");
    assert.equal(selected.data.data.outcome, "ACTIVATED");
    assert.equal(selected.data.data.applied, true);
    assert.equal(selected.data.data.vehicle.routeId, "f5-route-1", "vehiculo proyectado");
    assert.equal(selected.data.data.vehicle.assignedRoute, undefined, "vista minima (sin geometria)");
    console.log("ok - F5 API: el conductor auto-activa su asignacion seleccionable");

    // --- Aislamiento: el conductor no puede seleccionar asignacion de otra unidad ---
    const foreignSelect = await request(ctx, `/navigation/assignments/${ctx.foreignId}/select`, "POST", {});
    assert.equal(foreignSelect.status, 403, "select de otra unidad -> 403");
    console.log("ok - F5 API: el conductor no activa la unidad de otro (403)");

    console.log("ok - vehicle-route-assignment-driver-api F5: mine + select + selectableByDriver + aislamiento");
  } finally {
    await ctx.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
