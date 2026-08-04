// RC-MULTI-ROUTE-DRIVER-01 F4 — API admin de asignaciones (/api/navigation/assignments).
// Integracion HTTP sobre el store embedded: create/list/get/activate + permisos + emision (no rompe sin io).

const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");

async function createContext() {
  const store = createEmbeddedStore();
  const admin = store.getUserById("user-admin-01");
  const organizationId = admin.organizationId;
  const route = store.createRoute({
    id: "f4-route-1", organizationId, name: "F4-R1", code: "F4-R1", color: "#1473E6",
    origin: { latitude: 19.415, longitude: -99.073 }, destination: { latitude: 19.4452, longitude: -99.1513 },
    originLabel: "A", destinationLabel: "B", stops: [],
    distanceMeters: 1000, durationSeconds: 600, durationInTrafficSeconds: 600,
    polyline: [{ latitude: 19.415, longitude: -99.073 }, { latitude: 19.4452, longitude: -99.1513 }],
    createdBy: admin.id
  });
  const vehicle = store.createVehicle({ organizationId, code: "F4-U1", plate: "F4-001" });
  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    store, organizationId, routeId: route.id, vehicleId: vehicle.id,
    adminToken: signToken(admin),
    driverToken: signToken(store.getUserById("user-driver-01")),
    url: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  };
}

async function request(ctx, path, method = "GET", body, token = ctx.adminToken) {
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
    // --- Crear ---
    const created = await request(ctx, "/navigation/assignments", "POST", { vehicleId: ctx.vehicleId, routeId: ctx.routeId });
    assert.equal(created.status, 201, "POST /assignments -> 201");
    assert.equal(created.data.data.status, "AVAILABLE", "creada AVAILABLE");
    const assignmentId = created.data.data.id;

    // Validaciones de entrada.
    const noRoute = await request(ctx, "/navigation/assignments", "POST", { vehicleId: ctx.vehicleId });
    assert.equal(noRoute.status, 400, "POST sin routeId -> 400");
    const badRoute = await request(ctx, "/navigation/assignments", "POST", { vehicleId: ctx.vehicleId, routeId: "no-existe" });
    assert.equal(badRoute.status, 404, "POST con ruta inexistente -> 404");
    console.log("ok - F4 API: crear asignacion + validaciones (400/404)");

    // --- Listar / obtener ---
    const list = await request(ctx, `/navigation/assignments?vehicleId=${ctx.vehicleId}`);
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.data.data) && list.data.data.some((a) => a.id === assignmentId), "list incluye la creada");
    const listActive = await request(ctx, `/navigation/assignments?vehicleId=${ctx.vehicleId}&status=ACTIVE`);
    assert.equal(listActive.data.data.length, 0, "list filtro status ACTIVE (aun ninguna)");
    const one = await request(ctx, `/navigation/assignments/${assignmentId}`);
    assert.equal(one.status, 200);
    assert.equal(one.data.data.id, assignmentId);
    const missing = await request(ctx, "/navigation/assignments/no-existe");
    assert.equal(missing.status, 404, "GET desconocida -> 404");
    console.log("ok - F4 API: listar (con filtro) y obtener (404 desconocida)");

    // --- Activar ---
    const activated = await request(ctx, `/navigation/assignments/${assignmentId}/activate`, "POST", { reason: "admin_activated" });
    assert.equal(activated.status, 200, "activate -> 200");
    assert.equal(activated.data.data.outcome, "ACTIVATED");
    assert.equal(activated.data.data.applied, true);
    assert.equal(activated.data.data.vehicle.routeId, ctx.routeId, "vehiculo proyectado a la ruta");
    // Vista MINIMA del vehiculo (sin geometria/coordenadas crudas).
    assert.equal(activated.data.data.vehicle.assignedRoute, undefined, "evento/respuesta sin assignedRoute pesado");
    assert.ok(!("polyline" in activated.data.data.vehicle), "vista minima sin polyline");

    // Idempotencia por HTTP.
    const idem = await request(ctx, `/navigation/assignments/${assignmentId}/activate`, "POST", {});
    assert.equal(idem.status, 200);
    assert.equal(idem.data.data.outcome, "IDEMPOTENT");
    assert.equal(idem.data.data.applied, false);
    console.log("ok - F4 API: activar (ACTIVATED + proyeccion minima) e idempotencia");

    // --- Conflicto already_active ---
    const second = await request(ctx, "/navigation/assignments", "POST", { vehicleId: ctx.vehicleId, routeId: ctx.routeId });
    const conflict = await request(ctx, `/navigation/assignments/${second.data.data.id}/activate`, "POST", {});
    assert.equal(conflict.status, 409, "activar 2a con una ACTIVE -> 409");
    assert.equal(conflict.data.code, "already_active", "code already_active");
    assert.equal(conflict.data.ok, false);
    console.log("ok - F4 API: conflicto already_active -> 409 con code");

    // --- Permisos: driver no admin -> 403 ---
    const driverCreate = await request(ctx, "/navigation/assignments", "POST", { vehicleId: ctx.vehicleId, routeId: ctx.routeId }, ctx.driverToken);
    assert.equal(driverCreate.status, 403, "driver no puede crear -> 403");
    const driverActivate = await request(ctx, `/navigation/assignments/${assignmentId}/activate`, "POST", {}, ctx.driverToken);
    assert.equal(driverActivate.status, 403, "driver no puede activar -> 403");
    console.log("ok - F4 API: permisos (driver -> 403)");

    console.log("ok - vehicle-route-assignment-api F4: create/list/get/activate + permisos + emision segura");
  } finally {
    await ctx.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
