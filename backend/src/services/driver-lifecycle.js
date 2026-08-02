const { buildSubscription, pickActiveOrder } = require("./portal-account");
const { listAdminActivationKeys } = require("./activation-keys");
const { listSessionsForUser, revokeAllSessions } = require("./sessions");

class DriverLifecycleError extends Error {
  constructor(message, statusCode = 400, code = "FLEET_LIFECYCLE_ERROR", details = null) {
    super(message);
    this.name = "DriverLifecycleError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function assertReason(reason, label = "El motivo") {
  const normalized = String(reason || "").trim();
  if (normalized.length < 3) {
    throw new DriverLifecycleError(`${label} es obligatorio.`, 400, "REASON_REQUIRED");
  }
  return normalized.slice(0, 500);
}

async function getCommercialContext(store, actor) {
  const orders = await store.listCommercialOrdersForUser(actor);
  const order = pickActiveOrder(orders);
  return { order, subscription: buildSubscription(order) };
}

function throwStoreError(result) {
  const messages = {
    active_session: "Finaliza la jornada activa antes de continuar.",
    capacity: "No hay cupo disponible en el plan para reactivar este conductor.",
    driver_assigned: "Libera al conductor antes de retirar la unidad.",
    has_dependencies: "La unidad conserva historial o dependencias y debe retirarse en lugar de eliminarse.",
    not_found: "Recurso no encontrado.",
    not_suspended: "Primero da de baja al conductor antes de eliminarlo definitivamente.",
    plan_inactive: "El plan de la empresa no está activo.",
    route_assigned: "Desasigna la ruta antes de retirar la unidad.",
    suspended: "Reactiva al conductor antes de asignarle una unidad.",
    vehicle_assigned: "Libera la unidad antes de eliminar al conductor.",
    vehicle_not_found: "Unidad no encontrada.",
    vehicle_taken: "La unidad ya no está disponible. Actualiza la lista y elige otra."
  };
  const code = result?.code || "transition_failed";
  const statusCode = code === "not_found" || code === "vehicle_not_found" ? 404 : 409;
  throw new DriverLifecycleError(messages[code] || "No fue posible completar la transición.", statusCode, code);
}

async function previewDriverLifecycleImpact(store, { organizationId, userId }) {
  const dependencies = await store.getDriverLifecycleDependencies(userId, organizationId);
  if (!dependencies || dependencies.user?.deletedAt) {
    throw new DriverLifecycleError("Conductor no encontrado.", 404, "not_found");
  }
  if (dependencies.user.role !== "driver") {
    throw new DriverLifecycleError("Esta acción solo aplica a conductores.", 409, "not_driver");
  }

  const sessions = await listSessionsForUser(userId).catch(() => []);
  const activeSessions = sessions.filter((entry) => entry.isActive && !entry.revokedAt).length;
  const suspended = String(dependencies.user.userStatus || "active") === "suspended";
  const blockers = [];
  const warnings = [];

  if (dependencies.activeSession) blockers.push("Finaliza la jornada activa.");
  if (dependencies.vehicle) warnings.push(`Se liberará la unidad ${dependencies.vehicle.code}.`);
  if (dependencies.documentCount > 0) warnings.push("Los documentos se conservarán como evidencia histórica.");
  if (dependencies.historicalSessionCount > 0) warnings.push("Las jornadas históricas conservarán la referencia del conductor.");

  return {
    conductor: dependencies.user,
    status: dependencies.user.userStatus || "active",
    assignedVehicle: dependencies.vehicle,
    vehicleRoute: dependencies.vehicle?.route || dependencies.vehicle?.assignedRoute || null,
    activeRouteSession: dependencies.activeSession
      ? {
          id: dependencies.activeSession.id || dependencies.activeSession._id,
          startedAt: dependencies.activeSession.startedAt,
          status: dependencies.activeSession.status
        }
      : null,
    relatedDocuments: { count: dependencies.documentCount },
    sessionsToRevoke: activeSessions,
    releasesPlanSlot: !suspended,
    canOffboard: !dependencies.activeSession,
    canDelete: suspended && !dependencies.vehicle && !dependencies.activeSession,
    blockers,
    warnings
  };
}

async function previewVehicleDeletionImpact(store, { organizationId, vehicleId }) {
  const dependencies = await store.getVehicleLifecycleDependencies(vehicleId, organizationId);
  if (!dependencies) throw new DriverLifecycleError("Unidad no encontrada.", 404, "not_found");

  const vehicle = dependencies.vehicle;
  const blockers = [];
  const actionsRequired = [];
  if (dependencies.activeSession) {
    blockers.push("La unidad tiene una jornada activa.");
    actionsRequired.push("Finalizar jornada");
  }
  if (vehicle.driverId) actionsRequired.push("Liberar conductor");
  if (vehicle.routeId || vehicle.assignedRoute) actionsRequired.push("Desasignar ruta");
  if (dependencies.documentCount > 0) actionsRequired.push("Revisar documentos");

  const historyCount =
    dependencies.routeSessionCount + dependencies.positionCount + dependencies.incidentCount + dependencies.tripLogCount;
  const hasHistory = historyCount > 0 || dependencies.documentCount > 0;
  const hasCurrentDependencies = Boolean(
    vehicle.driverId || vehicle.routeId || vehicle.assignedRoute || dependencies.activeSession
  );

  return {
    vehicle,
    driver: dependencies.driver,
    route: vehicle.route || vehicle.assignedRoute || null,
    activeRouteSession: dependencies.activeSession
      ? {
          id: dependencies.activeSession.id || dependencies.activeSession._id,
          startedAt: dependencies.activeSession.startedAt,
          status: dependencies.activeSession.status
        }
      : null,
    history: {
      routeSessions: dependencies.routeSessionCount,
      positions: dependencies.positionCount,
      incidents: dependencies.incidentCount,
      tripLogs: dependencies.tripLogCount,
      total: historyCount
    },
    documents: { count: dependencies.documentCount },
    canDeletePermanently: !hasCurrentDependencies && !hasHistory,
    mustRetire: hasHistory,
    canRetire: !hasCurrentDependencies,
    blockers,
    actionsRequired
  };
}

async function releaseDriverVehicle(store, { organizationId, userId }) {
  const result = await store.changeDriverVehicle({ organizationId, userId, vehicleId: null });
  if (!result?.ok) throwStoreError(result);
  return result;
}

async function changeDriverVehicle(store, { organizationId, userId, vehicleId }) {
  if (!String(vehicleId || "").trim()) return releaseDriverVehicle(store, { organizationId, userId });
  const result = await store.changeDriverVehicle({ organizationId, userId, vehicleId: String(vehicleId).trim() });
  if (!result?.ok) throwStoreError(result);
  return result;
}

async function offboardDriver(store, { actorId, actor, organizationId, reason, releaseVehicle = true, userId }) {
  const safeReason = assertReason(reason, "El motivo de baja");
  if (releaseVehicle !== true) {
    throw new DriverLifecycleError("La baja requiere liberar la unidad asignada.", 409, "release_required");
  }

  const impact = await previewDriverLifecycleImpact(store, { organizationId, userId });
  if (!impact.canOffboard) {
    throw new DriverLifecycleError(impact.blockers[0], 409, "active_session", impact);
  }
  const { order } = await getCommercialContext(store, actor);

  await revokeAllSessions(userId, null, "driver_offboarded");
  const result = await store.offboardDriverState({
    actorId,
    organizationId,
    orderId: order?.id || null,
    reason: safeReason,
    userId
  });
  if (!result?.ok) throwStoreError(result);

  if (result.user?.activationKeyId) {
    await store.updateActivationKey(
      result.user.activationKeyId,
      { usedByDriverState: "offboarded" },
      { companyId: organizationId, status: "used" }
    );
  }

  return {
    ...result,
    capacity: await listAdminActivationKeys(store, actor),
    message: result.changed
      ? "Conductor dado de baja. La unidad y el cupo quedaron disponibles; ya puedes generar una key nueva."
      : "El conductor ya estaba dado de baja."
  };
}

async function reactivateDriver(store, { actor, organizationId, userId }) {
  const { order, subscription } = await getCommercialContext(store, actor);
  if (!order || !subscription.isActive) {
    throw new DriverLifecycleError("El plan de la empresa no está activo.", 409, "plan_inactive");
  }

  const result = await store.reactivateDriverWithinCapacity({
    organizationId,
    orderId: order.id,
    userId,
    maxDrivers: subscription.unitsLimit
  });
  if (!result?.ok) throwStoreError(result);

  if (result.user?.activationKeyId) {
    await store.updateActivationKey(
      result.user.activationKeyId,
      { usedByDriverState: "active" },
      { companyId: organizationId, status: "used" }
    );
  }

  return {
    ...result,
    capacity: await listAdminActivationKeys(store, actor)
  };
}

async function deleteDriverSafely(store, { actorId, confirmation, organizationId, reason, userId }) {
  if (String(confirmation || "").trim().toUpperCase() !== "ELIMINAR") {
    throw new DriverLifecycleError("Escribe ELIMINAR para confirmar.", 400, "confirmation_required");
  }
  const safeReason = assertReason(reason, "El motivo de eliminación");
  const impact = await previewDriverLifecycleImpact(store, { organizationId, userId });
  if (!impact.canDelete) {
    throw new DriverLifecycleError(
      "Primero completa la baja, libera la unidad y finaliza la jornada.",
      409,
      "delete_blocked",
      impact
    );
  }
  await revokeAllSessions(userId, null, "driver_deleted");
  const result = await store.deleteDriverSafely({ actorId, organizationId, reason: safeReason, userId });
  if (!result?.ok) throwStoreError(result);

  if (result.user?.activationKeyId) {
    await store.updateActivationKey(
      result.user.activationKeyId,
      { usedByDriverState: "deleted" },
      { companyId: organizationId, status: "used" }
    );
  }
  return result;
}

async function retireVehicle(store, { actorId, organizationId, reason, vehicleId }) {
  const safeReason = assertReason(reason, "El motivo de retiro");
  const result = await store.retireVehicle({ actorId, organizationId, reason: safeReason, vehicleId });
  if (!result?.ok) throwStoreError(result);
  return result;
}

async function deleteVehicleSafely(store, { organizationId, vehicleId }) {
  const impact = await previewVehicleDeletionImpact(store, { organizationId, vehicleId });
  if (!impact.canDeletePermanently) {
    throw new DriverLifecycleError(
      impact.mustRetire
        ? "La unidad conserva historial y debe retirarse en lugar de eliminarse."
        : "Resuelve las dependencias de la unidad antes de eliminarla.",
      409,
      "vehicle_delete_blocked",
      impact
    );
  }
  const result = await store.deleteUnusedVehicle({ organizationId, vehicleId });
  if (!result?.ok) throwStoreError(result);
  return result;
}

module.exports = {
  DriverLifecycleError,
  changeDriverVehicle,
  deleteDriverSafely,
  deleteVehicleSafely,
  offboardDriver,
  previewDriverLifecycleImpact,
  previewVehicleDeletionImpact,
  reactivateDriver,
  releaseDriverVehicle,
  retireVehicle
};
