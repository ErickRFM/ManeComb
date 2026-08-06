const { ACTIVE_JOURNEY_STATUSES } = require("../domain/journey-lifecycle");
const { ensureJourneyStoreCompatibility } = require("./journey-store-compatibility");

class JourneyAssignmentError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "JourneyAssignmentError";
    this.code = code;
    this.details = details;
  }
}

const assignmentLocks = new Map();

function withAssignmentLock(key, task) {
  const previous = assignmentLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  assignmentLocks.set(key, run.catch(() => undefined));
  return run;
}

function parseRequiredDate(value, code, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new JourneyAssignmentError(code, `${label} no es valido`);
  }
  return parsed;
}

function getOrganizationId(resource) {
  return String(resource?.organizationId || resource?.companyId || "").trim();
}

function getResourceId(resource) {
  return String(resource?.id || resource?._id || "").trim();
}

function intervalsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function sessionInterval(session) {
  const start = new Date(session.scheduledStartAt || session.startedAt || session.createdAt || 0);
  const end = new Date(session.scheduledEndAt || session.finishedAt || "9999-12-31T23:59:59.999Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function isSameAssignment(session, input) {
  return (
    String(session.driverId) === input.driverId &&
    String(session.vehicleId) === input.vehicleId &&
    String(session.routeId) === input.routeId &&
    new Date(session.scheduledStartAt || 0).getTime() === input.scheduledStartAt.getTime() &&
    new Date(session.scheduledEndAt || 0).getTime() === input.scheduledEndAt.getTime()
  );
}

async function getStoreResource(store, method, id) {
  if (typeof store?.[method] !== "function") {
    throw new TypeError(`journey-assignment-service requiere store.${method}`);
  }
  return store[method](id);
}

async function createJourneyAssignment({
  store,
  actor,
  driverId,
  vehicleId,
  routeId,
  scheduledStartAt,
  scheduledEndAt,
  notes = null,
  supervisorId = null
}) {
  ensureJourneyStoreCompatibility(store);

  if (!store || typeof store.listRouteSessions !== "function" || typeof store.createRouteSession !== "function" || typeof store.updateRouteSession !== "function") {
    throw new TypeError("journey-assignment-service requiere un store de jornadas valido");
  }
  if (!actor?.id) {
    throw new JourneyAssignmentError("actor_required", "Se requiere un actor autenticado");
  }

  const input = {
    driverId: String(driverId || "").trim(),
    vehicleId: String(vehicleId || "").trim(),
    routeId: String(routeId || "").trim(),
    scheduledStartAt: parseRequiredDate(scheduledStartAt, "scheduled_start_invalid", "scheduledStartAt"),
    scheduledEndAt: parseRequiredDate(scheduledEndAt, "scheduled_end_invalid", "scheduledEndAt")
  };

  if (!input.driverId || !input.vehicleId || !input.routeId) {
    throw new JourneyAssignmentError("assignment_fields_required", "Conductor, unidad y ruta son obligatorios");
  }
  if (input.scheduledEndAt <= input.scheduledStartAt) {
    throw new JourneyAssignmentError("schedule_invalid", "scheduledEndAt debe ser posterior a scheduledStartAt");
  }

  const organizationId = String(actor.organizationId || "").trim();
  if (!organizationId) {
    throw new JourneyAssignmentError("organization_required", "La asignacion requiere una organizacion");
  }

  const lockKey = `${organizationId}:${input.driverId}:${input.vehicleId}`;
  return withAssignmentLock(lockKey, async () => {
    const [driver, vehicle, route] = await Promise.all([
      getStoreResource(store, "getUserById", input.driverId),
      getStoreResource(store, "getVehicleById", input.vehicleId),
      getStoreResource(store, "getRouteById", input.routeId)
    ]);

    if (!driver || driver.role !== "driver" || driver.deletedAt) {
      throw new JourneyAssignmentError("driver_not_found", "Conductor no encontrado");
    }
    if (["suspended", "inactive", "blocked"].includes(String(driver.userStatus || "").toLowerCase())) {
      throw new JourneyAssignmentError("driver_unavailable", "El conductor no esta disponible");
    }
    if (!vehicle || vehicle.retiredAt) {
      throw new JourneyAssignmentError("vehicle_not_found", "Unidad no encontrada");
    }
    if (["maintenance", "retired"].includes(String(vehicle.status || "").toLowerCase())) {
      throw new JourneyAssignmentError("vehicle_unavailable", "La unidad no esta disponible");
    }
    if (!route) {
      throw new JourneyAssignmentError("route_not_found", "Ruta no encontrada");
    }

    for (const resource of [driver, vehicle, route]) {
      if (getOrganizationId(resource) !== organizationId) {
        throw new JourneyAssignmentError("tenant_mismatch", "Los recursos no pertenecen a la misma organizacion");
      }
    }

    if ((driver.vehicleId && String(driver.vehicleId) !== input.vehicleId) || (vehicle.driverId && String(vehicle.driverId) !== input.driverId)) {
      throw new JourneyAssignmentError(
        "driver_vehicle_mismatch",
        "El conductor y la unidad no tienen un match operativo vigente"
      );
    }

    if (vehicle.routeId && String(vehicle.routeId) !== input.routeId) {
      throw new JourneyAssignmentError("vehicle_route_mismatch", "La unidad no tiene asignada la ruta seleccionada");
    }

    const sessions = await store.listRouteSessions({ organizationId, limit: 5000 });
    const activeSessions = sessions.filter((session) => ACTIVE_JOURNEY_STATUSES.has(String(session.status || "").toUpperCase()));
    const duplicate = activeSessions.find((session) => isSameAssignment(session, input));
    if (duplicate) {
      return { applied: false, idempotent: true, session: duplicate };
    }

    const conflicting = activeSessions.find((session) => {
      if (String(session.driverId) !== input.driverId && String(session.vehicleId) !== input.vehicleId) return false;
      const interval = sessionInterval(session);
      if (!interval) return true;
      return intervalsOverlap(input.scheduledStartAt, input.scheduledEndAt, interval.start, interval.end);
    });
    if (conflicting) {
      throw new JourneyAssignmentError("schedule_conflict", "El conductor o la unidad ya tienen una jornada en ese horario", {
        conflictingSessionId: getResourceId(conflicting)
      });
    }

    const created = await store.createRouteSession({
      organizationId,
      driverId: input.driverId,
      vehicleId: input.vehicleId,
      routeId: input.routeId,
      assignedBy: actor.id,
      supervisorId: supervisorId ? String(supervisorId).trim() : null,
      notes: notes ? String(notes).trim() : null,
      scheduledStartAt: input.scheduledStartAt.toISOString(),
      scheduledEndAt: input.scheduledEndAt.toISOString(),
      startedAt: input.scheduledStartAt.toISOString()
    });

    if (!created) {
      throw new JourneyAssignmentError("assignment_create_failed", "No fue posible crear la jornada");
    }
    if (created.creationApplied === false) {
      if (isSameAssignment(created, input)) {
        return { applied: false, idempotent: true, session: created };
      }
      throw new JourneyAssignmentError("vehicle_active_journey", "La unidad ya tiene una jornada activa");
    }

    const assigned = await store.updateRouteSession(created.id, {
      expectedStatus: "RUNNING",
      status: "ASSIGNED",
      scheduledStartAt: input.scheduledStartAt.toISOString(),
      scheduledEndAt: input.scheduledEndAt.toISOString(),
      startedAt: null,
      confirmedAt: null,
      confirmedBy: null,
      assignedBy: actor.id,
      updatedBy: actor.id,
      timingMigrationVersion: 1
    });

    if (!assigned || assigned.transitionApplied === false) {
      throw new JourneyAssignmentError("assignment_transition_failed", "La jornada cambio durante la asignacion");
    }

    const { transitionApplied, creationApplied, ...session } = assigned;
    return { applied: true, idempotent: false, session };
  });
}

module.exports = {
  JourneyAssignmentError,
  createJourneyAssignment,
  intervalsOverlap
};
