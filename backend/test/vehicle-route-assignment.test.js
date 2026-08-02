const assert = require("node:assert/strict");
const {
  STATUS,
  ALL_STATUSES,
  SOURCES,
  REASONS,
  isTerminal,
  isValidAssignmentTransition,
  isScheduleWindowOpen,
  getEffectiveStatus,
  canActivate,
  compareAssignments,
  checkActivationVersion,
  checkRouteRevision,
  validateStateInvariants,
  validateAssignmentInput,
  sanitizeAuditContext,
  serializeVehicleRouteAssignment
} = require("../src/domain/vehicle-route-assignment");
const { VehicleRouteAssignmentModel } = require("../src/data/models");

// ---- Matriz de transiciones ----
assert.equal(isValidAssignmentTransition(STATUS.AVAILABLE, STATUS.ACTIVE), true);
assert.equal(isValidAssignmentTransition(STATUS.AVAILABLE, STATUS.CANCELLED), true);
assert.equal(isValidAssignmentTransition(STATUS.AVAILABLE, STATUS.COMPLETED), false);
assert.equal(isValidAssignmentTransition(STATUS.SCHEDULED, STATUS.ACTIVE), true);
assert.equal(isValidAssignmentTransition(STATUS.SCHEDULED, STATUS.AVAILABLE), true);
assert.equal(isValidAssignmentTransition(STATUS.SCHEDULED, STATUS.EXPIRED), true);
assert.equal(isValidAssignmentTransition(STATUS.ACTIVE, STATUS.COMPLETED), true);
assert.equal(isValidAssignmentTransition(STATUS.ACTIVE, STATUS.CANCELLED), true);
assert.equal(isValidAssignmentTransition(STATUS.ACTIVE, STATUS.AVAILABLE), false);
for (const terminal of [STATUS.COMPLETED, STATUS.CANCELLED, STATUS.EXPIRED]) {
  assert.equal(isTerminal(terminal), true);
  for (const to of ALL_STATUSES) {
    assert.equal(isValidAssignmentTransition(terminal, to), false, `${terminal} es terminal`);
  }
}
assert.equal(isValidAssignmentTransition("BOGUS", STATUS.ACTIVE), false);
console.log("ok - matriz de transiciones y estados terminales");

// ---- Ventana horaria ----
const now = new Date("2026-06-15T12:00:00.000Z");
assert.equal(isScheduleWindowOpen({}, now), true);
assert.equal(isScheduleWindowOpen({ scheduledFrom: "2026-06-15T10:00:00.000Z" }, now), true);
assert.equal(isScheduleWindowOpen({ scheduledFrom: "2026-06-15T13:00:00.000Z" }, now), false);
assert.equal(isScheduleWindowOpen({ scheduledUntil: "2026-06-15T11:00:00.000Z" }, now), false);
assert.equal(
  isScheduleWindowOpen({ scheduledFrom: "2026-06-15T10:00:00.000Z", scheduledUntil: "2026-06-15T14:00:00.000Z" }, now),
  true
);
console.log("ok - ventana horaria scheduledFrom/Until");

// ---- Precondiciones de activacion ----
const base = {
  organizationId: "org-1",
  vehicleId: "veh-1",
  routeId: "route-1",
  status: STATUS.AVAILABLE,
  selectableByDriver: true
};
const ctx = { organizationId: "org-1", vehicleId: "veh-1", actor: "admin", now };
assert.deepEqual(canActivate(base, ctx), { ok: true, reason: null });
assert.equal(canActivate(null, ctx).reason, "not_found");
assert.equal(canActivate({ ...base, status: STATUS.ACTIVE }, ctx).reason, "invalid_status");
assert.equal(canActivate({ ...base, organizationId: "org-2" }, ctx).reason, "tenant_mismatch");
assert.equal(canActivate({ ...base, vehicleId: "veh-2" }, ctx).reason, "vehicle_mismatch");
assert.equal(canActivate({ ...base, routeId: "" }, ctx).reason, "no_route");
assert.equal(canActivate(base, { ...ctx, hasOtherActive: true }).reason, "already_active");
assert.equal(canActivate(base, { ...ctx, withinOperationalSchedule: false }).reason, "outside_schedule");
// SCHEDULED fuera/dentro de ventana
assert.equal(
  canActivate({ ...base, status: STATUS.SCHEDULED, scheduledFrom: "2026-06-15T13:00:00.000Z" }, ctx).reason,
  "out_of_window"
);
assert.equal(
  canActivate({ ...base, status: STATUS.SCHEDULED, scheduledFrom: "2026-06-15T10:00:00.000Z" }, ctx).ok,
  true
);
// selectableByDriver solo gatea al conductor; admin puede activar bloqueada
assert.equal(canActivate({ ...base, selectableByDriver: false }, { ...ctx, actor: "driver" }).reason, "admin_locked");
assert.equal(canActivate({ ...base, selectableByDriver: false }, { ...ctx, actor: "admin" }).ok, true);
console.log("ok - precondiciones de activacion (status/tenant/vehiculo/ruta/otra ACTIVE/ventana/jornada/selectableByDriver)");

// ---- Validacion de entrada (paridad embedded) ----
assert.equal(validateAssignmentInput({ priority: 0 }).ok, true);
assert.equal(validateAssignmentInput({ priority: -1 }).ok, false);
assert.equal(validateAssignmentInput({ status: "BOGUS" }).ok, false);
assert.equal(
  validateAssignmentInput({ scheduledFrom: "2026-06-15T14:00:00.000Z", scheduledUntil: "2026-06-15T13:00:00.000Z" }).ok,
  false
);
assert.equal(
  validateAssignmentInput({ scheduledFrom: "2026-06-15T10:00:00.000Z", scheduledUntil: "2026-06-15T14:00:00.000Z" }).ok,
  true
);
console.log("ok - validacion de fechas coherentes y prioridad valida");

// ---- Serializacion ----
const serialized = serializeVehicleRouteAssignment({
  _id: "assign-1",
  organizationId: "org-1",
  vehicleId: "veh-1",
  routeId: "route-1",
  status: STATUS.ACTIVE,
  priority: 3,
  selectableByDriver: false,
  scheduledFrom: new Date("2026-06-15T10:00:00.000Z"),
  activationVersion: 2,
  routeRevision: 5
});
assert.equal(serialized.id, "assign-1");
assert.equal(serialized.status, "ACTIVE");
assert.equal(serialized.selectableByDriver, false);
assert.equal(serialized.scheduledFrom, "2026-06-15T10:00:00.000Z");
assert.equal(serialized.scheduledUntil, null);
assert.equal(serialized.routeRevision, 5);
assert.equal(serializeVehicleRouteAssignment(null), null);
console.log("ok - serializacion del assignment");

// ---- Prioridad: orden estable y desempate determinista ----
// Menor priority = mayor prioridad. Desempate: priority ASC, scheduledFrom ASC, createdAt ASC, id ASC.
const unordered = [
  { _id: "d", priority: 5, scheduledFrom: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { _id: "b", priority: 1, scheduledFrom: "2026-01-02T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { _id: "a", priority: 1, scheduledFrom: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { _id: "c", priority: 1, scheduledFrom: "2026-01-01T00:00:00Z", createdAt: "2026-01-02T00:00:00Z" }
];
const ordered = [...unordered].sort(compareAssignments).map((x) => x._id);
assert.deepEqual(ordered, ["a", "c", "b", "d"], "orden estable priority/scheduledFrom/createdAt/id");
// Determinismo: mismo input desordenado distinto -> mismo resultado.
assert.deepEqual([...unordered].reverse().sort(compareAssignments).map((x) => x._id), ["a", "c", "b", "d"]);
console.log("ok - prioridad: menor=mayor, desempate determinista");

// ---- Expiracion efectiva (sin cron) ----
const scheduledPast = { status: STATUS.SCHEDULED, scheduledUntil: "2026-06-15T11:00:00.000Z" };
assert.equal(getEffectiveStatus(scheduledPast, now), STATUS.EXPIRED, "SCHEDULED vencida => EXPIRED efectivo");
assert.equal(
  getEffectiveStatus({ status: STATUS.SCHEDULED, scheduledUntil: "2026-06-15T14:00:00.000Z" }, now),
  STATUS.SCHEDULED
);
assert.equal(getEffectiveStatus({ status: STATUS.AVAILABLE }, now), STATUS.AVAILABLE);
// canActivate rechaza la SCHEDULED vencida como 'expired' aunque el status persistido sea SCHEDULED.
assert.equal(
  canActivate({ ...base, status: STATUS.SCHEDULED, scheduledUntil: "2026-06-15T11:00:00.000Z" }, ctx).reason,
  "expired"
);
console.log("ok - expiracion efectiva: SCHEDULED vencida no activable (sin depender de proceso posterior)");

// ---- Concurrencia optimista: activationVersion / routeRevision ----
assert.deepEqual(checkActivationVersion(3, 3), { ok: true, conflict: false });
assert.deepEqual(checkActivationVersion(3, 4), { ok: false, conflict: true });
assert.deepEqual(checkActivationVersion(null, 9), { ok: true, conflict: false }); // sin CAS
assert.deepEqual(checkRouteRevision(2, 2), { ok: true, conflict: false });
assert.deepEqual(checkRouteRevision(2, 3), { ok: false, conflict: true }); // revision desactualizada => conflicto
console.log("ok - concurrencia optimista: expectedActivationVersion y routeRevision mismatch => conflicto");

// ---- Invariantes por estado ----
assert.equal(validateStateInvariants({ status: STATUS.AVAILABLE }).ok, true);
assert.equal(validateStateInvariants({ status: STATUS.AVAILABLE, activatedAt: new Date() }).ok, false);
assert.equal(validateStateInvariants({ status: STATUS.SCHEDULED }).ok, false); // falta scheduledFrom
assert.equal(validateStateInvariants({ status: STATUS.SCHEDULED, scheduledFrom: new Date() }).ok, true);
assert.equal(validateStateInvariants({ status: STATUS.ACTIVE }).ok, false); // falta activatedAt
assert.equal(validateStateInvariants({ status: STATUS.ACTIVE, activatedAt: new Date() }).ok, true);
assert.equal(validateStateInvariants({ status: STATUS.ACTIVE, activatedAt: new Date(), completedAt: new Date() }).ok, false);
assert.equal(validateStateInvariants({ status: STATUS.COMPLETED, activatedAt: new Date() }).ok, false); // falta completedAt
assert.equal(validateStateInvariants({ status: STATUS.COMPLETED, activatedAt: new Date(), completedAt: new Date() }).ok, true);
assert.equal(validateStateInvariants({ status: STATUS.CANCELLED }).ok, false); // falta cancelledAt
assert.equal(validateStateInvariants({ status: STATUS.CANCELLED, cancelledAt: new Date() }).ok, true);
console.log("ok - invariantes por estado (dominio autoridad)");

// ---- Actor/motivo + auditoria sanitizada ----
assert.ok(SOURCES.includes("driver") && SOURCES.includes("admin") && SOURCES.includes("system") && SOURCES.includes("schedule"));
["driver_selected", "admin_activated", "route_switched", "trip_completed", "admin_cancelled", "schedule_expired"].forEach(
  (r) => assert.ok(REASONS.includes(r), `reason ${r}`)
);
const audit = sanitizeAuditContext({
  actorId: "u-1",
  actorRole: "driver",
  source: "driver",
  reason: "driver_selected",
  assignmentId: "a-1",
  vehicleId: "v-1",
  routeId: "r-1",
  coordinates: { lat: 19.4, lng: -99.1 },
  token: "secret",
  snapshot: { polyline: [1, 2, 3] }
});
assert.equal(audit.actorId, "u-1");
assert.equal(audit.source, "driver");
assert.equal(audit.coordinates, undefined, "no filtra coordenadas");
assert.equal(audit.token, undefined, "no filtra tokens");
assert.equal(audit.snapshot, undefined, "no filtra snapshots");
assert.equal(sanitizeAuditContext({ source: "hacker", reason: "bogus" }).source, null); // whitelist
console.log("ok - actor/motivo y auditoria sanitizada (sin coordenadas/tokens/snapshots)");

// ---- Modelo mongoose: validadores + indices declarados ----
async function expectValidationError(doc, message) {
  let threw = false;
  try {
    await doc.validate();
  } catch {
    threw = true;
  }
  assert.ok(threw, message);
}

(async () => {
  await expectValidationError(
    new VehicleRouteAssignmentModel({ _id: "a", vehicleId: "v", routeId: "r", status: "BOGUS" }),
    "status invalido debe fallar validacion"
  );
  await expectValidationError(
    new VehicleRouteAssignmentModel({ _id: "a", vehicleId: "v", routeId: "r", priority: -1 }),
    "prioridad negativa debe fallar validacion"
  );
  await expectValidationError(
    new VehicleRouteAssignmentModel({
      _id: "a",
      vehicleId: "v",
      routeId: "r",
      scheduledFrom: new Date("2026-06-15T14:00:00.000Z"),
      scheduledUntil: new Date("2026-06-15T13:00:00.000Z")
    }),
    "scheduledUntil <= scheduledFrom debe fallar validacion"
  );
  const valid = new VehicleRouteAssignmentModel({ _id: "a", organizationId: "org-1", vehicleId: "v", routeId: "r" });
  await valid.validate();
  assert.equal(valid.status, "AVAILABLE", "estado por defecto AVAILABLE");

  const indexes = VehicleRouteAssignmentModel.schema.indexes();
  const activeUnique = indexes.find(
    ([, opts]) => opts && opts.unique && opts.partialFilterExpression && opts.partialFilterExpression.status === "ACTIVE"
  );
  assert.ok(activeUnique, "debe existir el indice unico parcial de ACTIVE");
  const hasPriorityIndex = indexes.some(
    ([keys]) => keys.organizationId === 1 && keys.vehicleId === 1 && keys.status === 1 && keys.priority === 1
  );
  assert.ok(hasPriorityIndex, "debe existir el indice de consulta org+vehicle+status+priority (ASC)");
  console.log("ok - modelo: validadores (status/prioridad/ventana) e indices (unico ACTIVE + consulta)");
  console.log("ok - vehicle-route-assignment F2.1: modelo endurecido, maquina de estados y contratos");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
