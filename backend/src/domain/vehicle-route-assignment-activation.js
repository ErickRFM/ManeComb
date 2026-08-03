// RC-MULTI-ROUTE-DRIVER-01 F3 (etapa 4/5) — Planificador PURO de la activacion.
//
// Decide QUE debe pasar dado un estado ya leido (target, ACTIVE actual, proyeccion del vehiculo,
// revision de la ruta, sesion). NO lee DB ni escribe: cada store (embedded/mongo) reune las
// lecturas, llama a este planificador y APLICA el plan de forma atomica. Asi la decision vive en
// un solo lugar y se prueba en aislamiento; ambos motores comparten exactamente la misma logica.
//
// Alcance F3: activa un target cuando NO hay otra ACTIVE (primera activacion), es idempotente si
// ya esta activo y proyectado, y reconcilia drift de proyeccion/revision. El CAMBIO de ruta
// (desactivar otra ACTIVE) es F6/F7 -> aqui otra ACTIVE distinta produce conflicto already_active.

const {
  STATUS,
  canActivate,
  checkActivationVersion,
  validateStateInvariants,
  sanitizeAuditContext
} = require("./vehicle-route-assignment");

const OUTCOME = Object.freeze({
  ACTIVATED: "ACTIVATED",
  IDEMPOTENT: "IDEMPOTENT",
  RECONCILED: "RECONCILED",
  CONFLICT: "CONFLICT"
});

function conflict(reason) {
  return { outcome: OUTCOME.CONFLICT, reason, assignmentPatch: null, projectVehicle: false, event: null };
}

function buildEvent(outcome, target, context) {
  return {
    type: "route-assignment:updated",
    outcome,
    ...sanitizeAuditContext({
      actorId: context.actorId,
      actorRole: context.actor,
      source: context.source,
      reason: context.reason,
      assignmentId: target.id,
      vehicleId: target.vehicleId,
      routeId: target.routeId
    })
  };
}

// Un target ya-ACTIVE cuya revision capturada quedo vieja frente a la oficial (solo si la oficial
// esta versionada: routeRevision > 0). 0 = legado no migrado -> no decide drift por si solo, pero
// si la oficial ya avanzo a >0 y el target sigue en 0, tambien es drift a reconciliar.
function isRevisionStale(targetRevision, routeRevision) {
  if (!(routeRevision > 0)) return false;
  return Number(targetRevision || 0) !== Number(routeRevision);
}

// input:
//   target: asignacion serializada objetivo (o null)
//   currentActive: asignacion ACTIVE serializada de la unidad (o null)
//   vehicleProjectsTarget: bool — Vehicle.assignedRoute ya proyecta target.routeId
//   routeRevision: number — Route.revision vigente de target.routeId
//   hasActiveSessionOnOtherRoute: bool — sesion RUNNING/PAUSED sobre OTRA ruta
//   context: { organizationId, vehicleId, actor, actorId, source, reason, now, withinOperationalSchedule }
//   expectedActiveAssignmentId: undefined=sin CAS | null=espera ninguna | id=espera esa
//   expectedActivationVersion: undefined=sin CAS | number
function planActivation(input = {}) {
  const {
    target,
    currentActive = null,
    vehicleProjectsTarget = false,
    routeRevision = 0,
    hasActiveSessionOnOtherRoute = false,
    context = {},
    expectedActiveAssignmentId,
    expectedActivationVersion
  } = input;

  if (!target) return conflict("not_found");
  // Aislamiento: tenant/vehiculo deben coincidir; si no, se trata como not_found (no filtra info).
  if (context.organizationId && target.organizationId !== context.organizationId) return conflict("not_found");
  if (context.vehicleId && String(target.vehicleId) !== String(context.vehicleId)) return conflict("not_found");

  // CAS sobre la ACTIVE esperada (control optimista del cambio concurrente).
  if (typeof expectedActiveAssignmentId !== "undefined") {
    const currentActiveId = currentActive ? currentActive.id : null;
    if ((expectedActiveAssignmentId || null) !== currentActiveId) {
      return conflict("active_assignment_conflict");
    }
  }

  // El target YA esta ACTIVE -> idempotencia o reconciliacion de drift (nunca reactiva).
  if (target.status === STATUS.ACTIVE) {
    const stale = isRevisionStale(target.routeRevision, routeRevision);
    if (vehicleProjectsTarget && !stale) {
      return { outcome: OUTCOME.IDEMPOTENT, reason: null, assignmentPatch: null, projectVehicle: false, event: null };
    }
    // Drift: la proyeccion del vehiculo no refleja el target, o la revision quedo vieja.
    const patch = { updatedAt: context.now };
    if (routeRevision > 0) patch.routeRevision = routeRevision;
    return {
      outcome: OUTCOME.RECONCILED,
      reason: null,
      assignmentPatch: patch,
      projectVehicle: true,
      event: buildEvent(OUTCOME.RECONCILED, target, context)
    };
  }

  // Target NO activo: activacion nueva. Otra ACTIVE distinta -> conflicto (el switch es F6/F7).
  const hasOtherActive = Boolean(currentActive && currentActive.id !== target.id);
  const check = canActivate(target, {
    organizationId: context.organizationId,
    vehicleId: context.vehicleId,
    actor: context.actor,
    now: context.now,
    hasOtherActive,
    withinOperationalSchedule: context.withinOperationalSchedule
  });
  if (!check.ok) return conflict(check.reason);

  // Proteccion de RouteSession: no activar una ruta distinta mientras una sesion corre en otra.
  if (hasActiveSessionOnOtherRoute) return conflict("active_route_session");

  // CAS sobre activationVersion del target.
  const versionCheck = checkActivationVersion(expectedActivationVersion, target.activationVersion);
  if (!versionCheck.ok) return conflict("activation_version_conflict");

  const nextAssignment = {
    ...target,
    status: STATUS.ACTIVE,
    activatedAt: context.now,
    activationVersion: Number(target.activationVersion || 0) + 1,
    routeRevision: routeRevision > 0 ? routeRevision : Number(target.routeRevision || 0),
    updatedAt: context.now
  };
  const invariants = validateStateInvariants(nextAssignment);
  if (!invariants.ok) return conflict(`invalid_state:${invariants.errors.join(",")}`);

  return {
    outcome: OUTCOME.ACTIVATED,
    reason: null,
    assignmentPatch: {
      status: STATUS.ACTIVE,
      activatedAt: context.now,
      activationVersion: nextAssignment.activationVersion,
      routeRevision: nextAssignment.routeRevision,
      updatedAt: context.now
    },
    projectVehicle: true,
    event: buildEvent(OUTCOME.ACTIVATED, target, context)
  };
}

module.exports = { OUTCOME, planActivation, isRevisionStale };
