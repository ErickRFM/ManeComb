// RC-MULTI-ROUTE-DRIVER-01 F3.1 — Contrato de INTEGRACION transaccional del adaptador Mongo,
// verificado con DOBLES controlados (NO prueba Mongo real; ver mongo-activation-replset.test.js).
// Demuestra: startSession requerido; withTransaction ejecutado; misma session en toda lectura/escritura;
// nada fuera de la tx; error intermedio aborta sin exito; E11000->already_active; transaction_unavailable
// falla cerrado; IDEMPOTENT no escribe; RECONCILED modifica solo Vehicle; CAS dentro de la tx; conflicto
// sin descriptor de evento.

const assert = require("node:assert/strict");
const { activateVehicleRouteAssignmentMongo } = require("../src/data/mongo-activation");

const POLYLINE = [{ latitude: 19.4, longitude: -99.0 }, { latitude: 19.5, longitude: -99.2 }];

// Construye modelos falsos que REGISTRAN cada consulta (op, session, inTx, filter, update) y una
// session falsa cuyo withTransaction marca inTx durante el callback.
function buildHarness(cfg = {}) {
  const ctx = {
    calls: [],
    started: 0,
    ended: false,
    txRan: false,
    inTx: false,
    startSessionError: cfg.startSessionError || null,
    withTransactionError: cfg.withTransactionError || null
  };

  const session = {
    id: "sess-1",
    async withTransaction(fn) {
      ctx.txRan = true;
      if (ctx.withTransactionError) throw ctx.withTransactionError;
      ctx.inTx = true;
      try {
        return await fn();
      } finally {
        ctx.inTx = false;
      }
    },
    async endSession() {
      ctx.ended = true;
    }
  };

  function chain(model, op, resolver, sessionFromOpts, meta = {}) {
    let sess = sessionFromOpts;
    const q = {
      session(s) { sess = s; return q; },
      lean() {
        ctx.calls.push({ model, op, session: sess, inTx: ctx.inTx, ...meta });
        const value = typeof resolver === "function" ? resolver() : resolver;
        if (value instanceof Error) return Promise.reject(value);
        return Promise.resolve(value);
      }
    };
    return q;
  }

  const assignmentModel = {
    db: {
      startSession() {
        ctx.started += 1;
        if (ctx.startSessionError) return Promise.reject(ctx.startSessionError);
        return Promise.resolve(session);
      }
    },
    findById: () => chain("assignment", "findById", cfg.target ?? null),
    findOne: () => chain("assignment", "findOne", cfg.active ?? null),
    findOneAndUpdate: (filter, update, opts = {}) =>
      chain("assignment", "findOneAndUpdate", cfg.assignmentUpdate ?? null, opts.session, { filter, update })
  };
  const vehicleModel = {
    findById: () => chain("vehicle", "findById", cfg.vehicle ?? null),
    findByIdAndUpdate: (id, update, opts = {}) =>
      chain("vehicle", "findByIdAndUpdate", cfg.vehicleUpdate ?? null, opts.session, { id, update })
  };
  const routeModel = { findById: () => chain("route", "findById", cfg.route ?? null) };
  const routeSessionModel = { findOne: () => chain("routeSession", "findOne", cfg.routeSession ?? null) };

  const deps = {
    VehicleRouteAssignmentModel: assignmentModel,
    VehicleModel: vehicleModel,
    RouteModel: routeModel,
    RouteSessionModel: routeSessionModel,
    assignedRouteFromSavedRoute: cfg.assignedRouteFromSavedRoute
      || (() => ({ routeId: "route-1", route: { polyline: POLYLINE } }))
  };

  return { ctx, deps, session };
}

const baseParams = { organizationId: "org-1", vehicleId: "veh-1", assignmentId: "a-1", actor: "admin", source: "admin", reason: "admin_activated" };
const availableTarget = { _id: "a-1", organizationId: "org-1", vehicleId: "veh-1", routeId: "route-1", status: "AVAILABLE", priority: 0, selectableByDriver: true, activationVersion: 0, routeRevision: 0 };
const activeTarget = { ...availableTarget, status: "ACTIVE", activationVersion: 1, routeRevision: 1, activatedAt: new Date("2026-01-01T00:00:00Z") };
const routeDoc = { _id: "route-1", name: "R", code: "R", color: "#000", revision: 1, origin: POLYLINE[0], destination: POLYLINE[1], polyline: POLYLINE, stops: [] };
const projectedAssignedRoute = { routeId: "route-1", route: { polyline: POLYLINE } };

function assertSameSession(ctx) {
  for (const call of ctx.calls) {
    assert.equal(call.session, ctx.session ?? call.session, `misma session en ${call.model}.${call.op}`);
  }
}

(async () => {
  // ============ ACTIVATED (happy path) ============
  {
    const h = buildHarness({
      target: availableTarget,
      active: null,
      vehicle: { _id: "veh-1", assignedRoute: null },
      route: routeDoc,
      assignmentUpdate: { ...availableTarget, status: "ACTIVE", activationVersion: 1, routeRevision: 1, activatedAt: new Date() },
      vehicleUpdate: { _id: "veh-1", routeId: "route-1", assignedRoute: projectedAssignedRoute }
    });
    const res = await activateVehicleRouteAssignmentMongo(h.deps, baseParams);

    assert.equal(h.ctx.started, 1, "startSession requerido (llamado 1 vez)");
    assert.equal(h.ctx.txRan, true, "withTransaction ejecutado");
    assert.equal(h.ctx.ended, true, "endSession llamado (finally)");
    // Misma session en TODA lectura/escritura.
    for (const call of h.ctx.calls) assert.equal(call.session, h.session, `misma session en ${call.model}.${call.op}`);
    // Ninguna operacion fuera de la transaccion.
    for (const call of h.ctx.calls) assert.equal(call.inTx, true, `${call.model}.${call.op} dentro de la tx`);
    // Se leyo la ACTIVE actual (CAS de activeAssignment) DENTRO de la tx.
    assert.ok(h.ctx.calls.some((c) => c.model === "assignment" && c.op === "findOne" && c.inTx), "lee ACTIVE dentro de la tx");
    // CAS de activationVersion en el filtro del update, y captura de routeRevision, dentro de la tx.
    const upd = h.ctx.calls.find((c) => c.model === "assignment" && c.op === "findOneAndUpdate");
    assert.ok(upd, "escribe la asignacion");
    assert.equal(upd.inTx, true, "update de asignacion dentro de la tx");
    assert.equal(upd.filter.activationVersion, 0, "CAS: filtra por activationVersion leido");
    assert.equal(upd.update.$set.activationVersion, 1, "escribe activationVersion++ dentro de la tx");
    assert.equal(upd.update.$set.routeRevision, 1, "captura routeRevision dentro de la tx");
    assert.equal(upd.update.$set.status, "ACTIVE");
    // Proyeccion del Vehicle dentro de la tx.
    const veh = h.ctx.calls.find((c) => c.model === "vehicle" && c.op === "findByIdAndUpdate");
    assert.ok(veh && veh.inTx, "proyecta Vehicle dentro de la tx");
    assert.equal(res.outcome, "ACTIVATED");
    assert.equal(res.applied, true);
    assert.ok(res.event && res.event.outcome === "ACTIVATED", "ACTIVATED devuelve descriptor de evento");
  }
  console.log("ok - mongo(doble): ACTIVATED usa una sola session, todo dentro de la tx, CAS+captura dentro");

  // ============ IDEMPOTENT (no escribe) ============
  {
    const h = buildHarness({
      target: activeTarget,
      active: activeTarget,
      vehicle: { _id: "veh-1", assignedRoute: projectedAssignedRoute },
      route: routeDoc
    });
    const res = await activateVehicleRouteAssignmentMongo(h.deps, baseParams);
    assert.equal(res.outcome, "IDEMPOTENT");
    assert.equal(res.applied, false);
    assert.equal(res.event, null, "IDEMPOTENT sin evento");
    assert.equal(h.ctx.calls.filter((c) => c.op.includes("Update")).length, 0, "IDEMPOTENT no ejecuta ninguna escritura");
  }
  console.log("ok - mongo(doble): IDEMPOTENT no escribe y no emite evento");

  // ============ RECONCILED (modifica SOLO Vehicle) ============
  {
    const h = buildHarness({
      target: activeTarget,
      active: activeTarget,
      vehicle: { _id: "veh-1", assignedRoute: null }, // proyeccion rota
      route: routeDoc,
      vehicleUpdate: { _id: "veh-1", routeId: "route-1", assignedRoute: projectedAssignedRoute }
    });
    const res = await activateVehicleRouteAssignmentMongo(h.deps, baseParams);
    assert.equal(res.outcome, "RECONCILED");
    assert.equal(res.applied, true);
    // Ninguna escritura sobre la ASIGNACION.
    assert.equal(h.ctx.calls.filter((c) => c.model === "assignment" && c.op === "findOneAndUpdate").length, 0, "RECONCILED NO escribe la asignacion");
    // SI escribe el Vehicle, dentro de la tx.
    const veh = h.ctx.calls.find((c) => c.model === "vehicle" && c.op === "findByIdAndUpdate");
    assert.ok(veh && veh.inTx, "RECONCILED re-proyecta el Vehicle dentro de la tx");
    assert.ok(res.event && res.event.outcome === "RECONCILED", "RECONCILED devuelve evento");
  }
  console.log("ok - mongo(doble): RECONCILED modifica unicamente el Vehicle");

  // ============ transaction_unavailable: startSession no soporta tx ============
  {
    const h = buildHarness({ startSessionError: Object.assign(new Error("Transaction numbers are only allowed on a replica set member or mongos")) });
    const res = await activateVehicleRouteAssignmentMongo(h.deps, baseParams);
    assert.equal(res.outcome, "CONFLICT");
    assert.equal(res.reason, "transaction_unavailable", "startSession sin tx -> fail-closed");
    assert.equal(res.applied, false);
    assert.equal(h.ctx.txRan, false, "no intenta transaccion");
  }
  // ============ transaction_unavailable: withTransaction falla por standalone ============
  {
    const h = buildHarness({
      target: availableTarget, active: null, vehicle: { _id: "veh-1", assignedRoute: null }, route: routeDoc,
      withTransactionError: Object.assign(new Error("This MongoDB deployment does not support retryable writes. replica set required"))
    });
    const res = await activateVehicleRouteAssignmentMongo(h.deps, baseParams);
    assert.equal(res.reason, "transaction_unavailable", "withTransaction sin replica set -> fail-closed");
    assert.equal(res.applied, false);
    assert.equal(h.ctx.ended, true, "endSession llamado incluso al fallar");
  }
  console.log("ok - mongo(doble): transaction_unavailable falla cerrado (startSession y withTransaction)");

  // ============ E11000 -> already_active ============
  {
    const h = buildHarness({
      target: availableTarget, active: null, vehicle: { _id: "veh-1", assignedRoute: null }, route: routeDoc,
      assignmentUpdate: () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 })
    });
    const res = await activateVehicleRouteAssignmentMongo(h.deps, baseParams);
    assert.equal(res.outcome, "CONFLICT");
    assert.equal(res.reason, "already_active", "E11000 del indice unico ACTIVE -> already_active");
    assert.equal(res.applied, false);
  }
  console.log("ok - mongo(doble): E11000 se traduce a already_active");

  // ============ activation_version_conflict: CAS pierde (update devuelve null) ============
  {
    const h = buildHarness({
      target: availableTarget, active: null, vehicle: { _id: "veh-1", assignedRoute: null }, route: routeDoc,
      assignmentUpdate: null // el guard por activationVersion no encontro doc
    });
    const res = await activateVehicleRouteAssignmentMongo(h.deps, baseParams);
    assert.equal(res.reason, "activation_version_conflict", "CAS perdido (findOneAndUpdate null) -> conflicto");
    // No se proyecta el Vehicle si la asignacion no se pudo actualizar.
    assert.equal(h.ctx.calls.filter((c) => c.model === "vehicle" && c.op === "findByIdAndUpdate").length, 0, "no escribe Vehicle si CAS falla");
  }
  console.log("ok - mongo(doble): CAS de activationVersion dentro de la tx (conflicto sin escribir Vehicle)");

  // ============ error intermedio aborta y NO devuelve exito ============
  {
    const h = buildHarness({
      target: availableTarget, active: null, vehicle: { _id: "veh-1", assignedRoute: null }, route: routeDoc,
      assignmentUpdate: { ...availableTarget, status: "ACTIVE", activationVersion: 1 },
      vehicleUpdate: () => new Error("fallo intermedio al proyectar")
    });
    await assert.rejects(
      () => activateVehicleRouteAssignmentMongo(h.deps, baseParams),
      /fallo intermedio/,
      "error intermedio (no E11000/no tx) se propaga: la tx aborta, sin resultado exitoso"
    );
    assert.equal(h.ctx.ended, true, "endSession llamado tras abortar");
  }
  console.log("ok - mongo(doble): error intermedio aborta la tx sin devolver exito");

  // ============ conflicto de contrato: sin descriptor de evento ============
  {
    const h = buildHarness({
      target: availableTarget, active: null, vehicle: { _id: "veh-1", assignedRoute: null }, route: routeDoc
    });
    const res = await activateVehicleRouteAssignmentMongo(h.deps, { ...baseParams, expectedActiveAssignmentId: "otra" });
    assert.equal(res.outcome, "CONFLICT");
    assert.equal(res.reason, "active_assignment_conflict");
    assert.equal(res.event, null, "conflicto NO devuelve descriptor de evento");
    assert.equal(h.ctx.calls.filter((c) => c.op.includes("Update")).length, 0, "conflicto no escribe nada");
  }
  console.log("ok - mongo(doble): conflicto no devuelve evento ni escribe");

  console.log("ok - mongo-activation F3.1: contrato de integracion transaccional (dobles) verificado");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
