// RC-MULTI-ROUTE-DRIVER-01 F2.1 — Logica PURA de la entidad de asignaciones multiples.
// Fuente unica de: estados, matriz de transiciones, precondiciones de activacion, validacion
// y serializacion. F3 (activateVehicleRouteAssignment) y F4/F5 (APIs) consumen esto; NO se
// duplica la regla en cada store. Sin acceso a DB (testeable en aislamiento).

const STATUS = Object.freeze({
  AVAILABLE: "AVAILABLE",
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED"
});

const ALL_STATUSES = Object.freeze(Object.values(STATUS));
const TERMINAL_STATUSES = Object.freeze([STATUS.COMPLETED, STATUS.CANCELLED, STATUS.EXPIRED]);

// Matriz de transiciones permitidas (documentada en RC-MULTI-ROUTE-DRIVER-01-F2.1.md).
// ACTIVE -> CANCELLED solo bajo regla explicita del cambio de ruta (F3/F7), no libre.
const TRANSITIONS = Object.freeze({
  [STATUS.AVAILABLE]: [STATUS.ACTIVE, STATUS.CANCELLED],
  [STATUS.SCHEDULED]: [STATUS.AVAILABLE, STATUS.ACTIVE, STATUS.EXPIRED, STATUS.CANCELLED],
  [STATUS.ACTIVE]: [STATUS.COMPLETED, STATUS.CANCELLED],
  [STATUS.COMPLETED]: [],
  [STATUS.CANCELLED]: [],
  [STATUS.EXPIRED]: []
});

function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

function isValidAssignmentTransition(from, to) {
  if (!ALL_STATUSES.includes(from) || !ALL_STATUSES.includes(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

function toMillis(value) {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// Ventana horaria abierta: from <= now <= until (limites nulos = sin restriccion en ese lado).
function isScheduleWindowOpen(assignment, now = new Date()) {
  const t = toMillis(now);
  if (t == null) return false;
  const from = toMillis(assignment && assignment.scheduledFrom);
  const until = toMillis(assignment && assignment.scheduledUntil);
  if (from != null && from > t) return false;
  if (until != null && until < t) return false;
  return true;
}

// Precondiciones de activacion. NO depende solo de selectableByDriver: ese booleano solo gatea
// la activacion por el CONDUCTOR (actor 'driver'); un admin puede activar aunque este bloqueada
// (selectableByDriver=false === ADMIN_LOCKED para el conductor). El resto de condiciones aplican
// a ambos actores. Devuelve { ok, reason } para trazabilidad y pruebas.
function canActivate(assignment, context = {}) {
  if (!assignment) return { ok: false, reason: "not_found" };
  if (assignment.status !== STATUS.AVAILABLE && assignment.status !== STATUS.SCHEDULED) {
    return { ok: false, reason: "invalid_status" };
  }
  if (context.organizationId && assignment.organizationId !== context.organizationId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  if (context.vehicleId && assignment.vehicleId !== context.vehicleId) {
    return { ok: false, reason: "vehicle_mismatch" };
  }
  if (!assignment.routeId) {
    return { ok: false, reason: "no_route" };
  }
  if (assignment.status === STATUS.SCHEDULED && !isScheduleWindowOpen(assignment, context.now)) {
    return { ok: false, reason: "out_of_window" };
  }
  if (context.hasOtherActive) {
    return { ok: false, reason: "already_active" };
  }
  if (context.actor === "driver" && assignment.selectableByDriver === false) {
    return { ok: false, reason: "admin_locked" };
  }
  if (context.withinOperationalSchedule === false) {
    return { ok: false, reason: "outside_schedule" };
  }
  return { ok: true, reason: null };
}

// Validacion de entrada store-agnostica (paridad embedded/mongo). Los validadores de mongoose
// cubren el camino DB; esto cubre el embedded y el input antes de persistir.
function validateAssignmentInput(input = {}) {
  const errors = [];
  if (input.status != null && !ALL_STATUSES.includes(input.status)) errors.push("invalid_status");
  if (input.priority != null && (Number.isNaN(Number(input.priority)) || Number(input.priority) < 0)) {
    errors.push("priority_invalid");
  }
  const from = toMillis(input.scheduledFrom);
  const until = toMillis(input.scheduledUntil);
  if (from != null && until != null && until <= from) errors.push("schedule_window_invalid");
  return { ok: errors.length === 0, errors };
}

function serializeVehicleRouteAssignment(doc) {
  if (!doc) return null;
  const raw = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const iso = (value) => (value ? new Date(value).toISOString() : null);
  return {
    id: raw._id || raw.id,
    organizationId: raw.organizationId,
    vehicleId: raw.vehicleId,
    routeId: raw.routeId,
    status: raw.status,
    priority: raw.priority == null ? 0 : raw.priority,
    selectableByDriver: raw.selectableByDriver !== false,
    scheduledFrom: iso(raw.scheduledFrom),
    scheduledUntil: iso(raw.scheduledUntil),
    assignedBy: raw.assignedBy == null ? null : raw.assignedBy,
    assignedAt: iso(raw.assignedAt),
    activatedAt: iso(raw.activatedAt),
    completedAt: iso(raw.completedAt),
    cancelledAt: iso(raw.cancelledAt),
    activationVersion: raw.activationVersion == null ? 0 : raw.activationVersion,
    routeRevision: raw.routeRevision == null ? 0 : raw.routeRevision
  };
}

module.exports = {
  STATUS,
  ALL_STATUSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
  isTerminal,
  isValidAssignmentTransition,
  isScheduleWindowOpen,
  canActivate,
  validateAssignmentInput,
  serializeVehicleRouteAssignment
};
