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

// Expiracion EFECTIVA sin depender de un cron: una SCHEDULED cuyo scheduledUntil ya paso se
// comporta como EXPIRED aunque el valor persistido siga siendo SCHEDULED. La seguridad de la
// activacion NO depende de un proceso posterior — canActivate usa este estado efectivo.
function getEffectiveStatus(assignment, now = new Date()) {
  if (!assignment) return null;
  if (assignment.status === STATUS.SCHEDULED) {
    const until = toMillis(assignment.scheduledUntil);
    const t = toMillis(now);
    if (until != null && t != null && until < t) return STATUS.EXPIRED;
  }
  return assignment.status;
}

// Precondiciones de activacion. NO depende solo de selectableByDriver: ese booleano solo gatea
// la activacion por el CONDUCTOR (actor 'driver'); un admin puede activar aunque este bloqueada
// (selectableByDriver=false === ADMIN_LOCKED para el conductor). El resto de condiciones aplican
// a ambos actores. Devuelve { ok, reason } para trazabilidad y pruebas.
function canActivate(assignment, context = {}) {
  if (!assignment) return { ok: false, reason: "not_found" };
  const effectiveStatus = getEffectiveStatus(assignment, context.now);
  if (effectiveStatus === STATUS.EXPIRED) {
    return { ok: false, reason: "expired" };
  }
  if (effectiveStatus !== STATUS.AVAILABLE && effectiveStatus !== STATUS.SCHEDULED) {
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
  // SCHEDULED aun no abierta (antes de scheduledFrom); la ya vencida cae en 'expired' arriba.
  if (effectiveStatus === STATUS.SCHEDULED && !isScheduleWindowOpen(assignment, context.now)) {
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

// Orden estable de prioridad. Menor priority = MAYOR prioridad (ASC). Desempate determinista:
// priority ASC -> scheduledFrom ASC -> createdAt ASC -> id ASC.
function compareAssignments(a, b) {
  const pa = a && a.priority != null ? Number(a.priority) : 0;
  const pb = b && b.priority != null ? Number(b.priority) : 0;
  if (pa !== pb) return pa - pb;
  const sfa = toMillis(a && a.scheduledFrom);
  const sfb = toMillis(b && b.scheduledFrom);
  if ((sfa || 0) !== (sfb || 0)) return (sfa || 0) - (sfb || 0);
  const ca = toMillis(a && a.createdAt);
  const cb = toMillis(b && b.createdAt);
  if ((ca || 0) !== (cb || 0)) return (ca || 0) - (cb || 0);
  const ida = String((a && (a._id || a.id)) || "");
  const idb = String((b && (b._id || b.id)) || "");
  return ida < idb ? -1 : ida > idb ? 1 : 0;
}

// Concurrencia optimista: expectedActivationVersion debe coincidir con el valor persistido.
// null/undefined = sin CAS (se acepta). Mismatch => conflicto (F3 responde 409, no toca nada).
function checkActivationVersion(expected, actual) {
  if (expected == null) return { ok: true, conflict: false };
  const match = Number(expected) === Number(actual);
  return { ok: match, conflict: !match };
}

// La revision de la ruta oficial no debe haber cambiado entre lectura y activacion. Mismatch =>
// conflicto (F3 responde 409, NO deja ninguna asignacion ACTIVE).
function checkRouteRevision(expected, actual) {
  if (expected == null) return { ok: true, conflict: false };
  const match = Number(expected) === Number(actual);
  return { ok: match, conflict: !match };
}

// Invariantes por estado. El DOMINIO es la autoridad; F3 corre esto ANTES de persistir (no se
// confia solo en los validadores de Mongoose).
function validateStateInvariants(assignment) {
  const errors = [];
  if (!assignment) return { ok: false, errors: ["not_found"] };
  const has = (field) => assignment[field] != null;
  switch (assignment.status) {
    case STATUS.AVAILABLE:
      if (has("activatedAt")) errors.push("available_has_activatedAt");
      if (has("completedAt")) errors.push("available_has_completedAt");
      if (has("cancelledAt")) errors.push("available_has_cancelledAt");
      break;
    case STATUS.SCHEDULED:
      if (!has("scheduledFrom")) errors.push("scheduled_missing_scheduledFrom");
      if (has("scheduledUntil") && toMillis(assignment.scheduledUntil) <= toMillis(assignment.scheduledFrom)) {
        errors.push("schedule_window_invalid");
      }
      break;
    case STATUS.ACTIVE:
      if (!has("activatedAt")) errors.push("active_missing_activatedAt");
      if (has("completedAt")) errors.push("active_has_completedAt");
      if (has("cancelledAt")) errors.push("active_has_cancelledAt");
      break;
    case STATUS.COMPLETED:
      if (!has("activatedAt")) errors.push("completed_missing_activatedAt");
      if (!has("completedAt")) errors.push("completed_missing_completedAt");
      break;
    case STATUS.CANCELLED:
      if (!has("cancelledAt")) errors.push("cancelled_missing_cancelledAt");
      break;
    case STATUS.EXPIRED:
      break;
    default:
      errors.push("unknown_status");
  }
  return { ok: errors.length === 0, errors };
}

// Actor y motivo de una transicion (para el contrato de F3 y la auditoria).
const SOURCES = Object.freeze(["driver", "admin", "system", "schedule"]);
const REASONS = Object.freeze([
  "driver_selected",
  "admin_activated",
  "route_switched",
  "trip_completed",
  "admin_cancelled",
  "schedule_expired"
]);

// Auditoria SANITIZADA: whitelist de campos seguros. NUNCA coordenadas, tokens, snapshots
// completos ni geometria en logs.
function sanitizeAuditContext(context = {}) {
  return {
    actorId: context.actorId == null ? null : String(context.actorId),
    actorRole: context.actorRole == null ? null : String(context.actorRole),
    source: SOURCES.includes(context.source) ? context.source : null,
    reason: REASONS.includes(context.reason) ? context.reason : null,
    assignmentId: context.assignmentId == null ? null : String(context.assignmentId),
    vehicleId: context.vehicleId == null ? null : String(context.vehicleId),
    routeId: context.routeId == null ? null : String(context.routeId)
  };
}

module.exports = {
  STATUS,
  ALL_STATUSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
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
};
