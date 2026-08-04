// RC-MULTI-ROUTE-DRIVER-01 F3 — Motor de activacion (camino Mongo) con dependencias INYECTADAS.
//
// Se extrajo del store para poder validar el CONTRATO DE INTEGRACION transaccional con dobles
// controlados (misma session en todas las lecturas/escrituras, nada fuera de la tx, E11000, etc.)
// SIN necesitar un mongod. El store real llama a esta funcion con sus modelos/serializadores; el
// comportamiento es identico al previo. La DECISION vive en planActivation (dominio puro).
//
// deps = { VehicleRouteAssignmentModel, VehicleModel, RouteModel, RouteSessionModel,
//          assignedRouteFromSavedRoute }

const { planActivation, OUTCOME } = require("../domain/vehicle-route-assignment-activation");
const { STATUS, serializeVehicleRouteAssignment } = require("../domain/vehicle-route-assignment");
const { serializeVehicle, hasActiveAssignedRoute, normalizeRouteId } = require("./serializers");

// Detecta que la transaccion NO esta disponible (mongo standalone sin replica set) para fallar
// CERRADO (no escribir) en vez de arriesgar dos ACTIVE por carrera.
function isTransactionUnavailable(error) {
  if (!error) return false;
  if (error.code === 20 || error.codeName === "IllegalOperation") return true;
  return /Transaction numbers are only allowed|replica set|mongos|Transactions are not supported/i.test(
    String(error.message || "")
  );
}

async function activateVehicleRouteAssignmentMongo(deps, params = {}) {
  const {
    VehicleRouteAssignmentModel,
    VehicleModel,
    RouteModel,
    RouteSessionModel,
    assignedRouteFromSavedRoute
  } = deps;

  const {
    organizationId,
    vehicleId,
    assignmentId,
    actor = "system",
    actorId = null,
    source = null,
    reason = null,
    expectedActiveAssignmentId,
    expectedActivationVersion,
    withinOperationalSchedule,
    now
  } = params;
  const nowDate = now ? new Date(now) : new Date();
  const nowIso = nowDate.toISOString();

  const conflictResult = (conflictReason, assignment = null, vehicle = null) => ({
    outcome: OUTCOME.CONFLICT,
    reason: conflictReason,
    applied: false,
    assignment,
    vehicle,
    event: null
  });

  let session;
  try {
    session = await VehicleRouteAssignmentModel.db.startSession();
  } catch (error) {
    if (isTransactionUnavailable(error)) return conflictResult("transaction_unavailable");
    throw error;
  }

  try {
    let result = conflictResult("transaction_unavailable");
    await session.withTransaction(async () => {
      // TODAS las lecturas dentro de la MISMA session/transaccion.
      const targetDoc = await VehicleRouteAssignmentModel.findById(assignmentId).session(session).lean();
      const activeDoc = await VehicleRouteAssignmentModel.findOne({
        organizationId,
        vehicleId: String(vehicleId),
        status: STATUS.ACTIVE
      }).session(session).lean();
      const vehicleDoc = await VehicleModel.findById(vehicleId).session(session).lean();
      const routeDoc = targetDoc && targetDoc.routeId
        ? await RouteModel.findById(targetDoc.routeId).session(session).lean()
        : null;
      const sessionDoc = await RouteSessionModel.findOne({
        vehicleId: String(vehicleId),
        status: { $in: ["RUNNING", "PAUSED"] }
      }).session(session).lean();

      const routeRevision = routeDoc && Number.isFinite(Number(routeDoc.revision)) ? Number(routeDoc.revision) : 0;
      const vehicleProjectsTarget = Boolean(
        targetDoc && vehicleDoc && hasActiveAssignedRoute(vehicleDoc.assignedRoute)
        && normalizeRouteId(vehicleDoc.assignedRoute && vehicleDoc.assignedRoute.routeId) === targetDoc.routeId
      );
      const hasActiveSessionOnOtherRoute = Boolean(
        targetDoc && sessionDoc && sessionDoc.routeId && String(sessionDoc.routeId) !== String(targetDoc.routeId)
      );

      const plan = planActivation({
        target: targetDoc ? serializeVehicleRouteAssignment(targetDoc) : null,
        currentActive: activeDoc ? serializeVehicleRouteAssignment(activeDoc) : null,
        vehicleProjectsTarget,
        routeRevision,
        hasActiveSessionOnOtherRoute,
        context: { organizationId, vehicleId: String(vehicleId), actor, actorId, source, reason, now: nowIso, withinOperationalSchedule },
        expectedActiveAssignmentId,
        expectedActivationVersion
      });

      const targetView = targetDoc ? serializeVehicleRouteAssignment(targetDoc) : null;
      const vehicleView = vehicleDoc ? serializeVehicle(vehicleDoc) : null;

      if (plan.outcome === OUTCOME.CONFLICT) {
        result = conflictResult(plan.reason, targetView, vehicleView);
        return;
      }
      if (plan.outcome === OUTCOME.IDEMPOTENT) {
        result = { outcome: plan.outcome, reason: null, applied: false, assignment: targetView, vehicle: vehicleView, event: null };
        return;
      }

      // ACTIVATED / RECONCILED: construir proyeccion antes de escribir.
      let projection = null;
      if (plan.projectVehicle) {
        if (!routeDoc) { result = conflictResult("no_route", targetView, vehicleView); return; }
        if (!vehicleDoc) { result = conflictResult("vehicle_not_found", targetView, null); return; }
        projection = assignedRouteFromSavedRoute(routeDoc, vehicleDoc.assignedRoute, targetDoc.assignedBy);
        if (!projection) { result = conflictResult("route_projection_failed", targetView, vehicleView); return; }
      }

      // Escritura de la ASIGNACION solo si hay patch (ACTIVATED). RECONCILED => assignmentPatch null
      // => NO se toca la asignacion (modifica unicamente Vehicle).
      let updatedAssignment = targetDoc;
      if (plan.assignmentPatch) {
        const setPatch = { updatedAt: nowDate };
        if (plan.assignmentPatch.status) setPatch.status = plan.assignmentPatch.status;
        if (plan.assignmentPatch.activatedAt) setPatch.activatedAt = nowDate;
        if (typeof plan.assignmentPatch.activationVersion !== "undefined") setPatch.activationVersion = plan.assignmentPatch.activationVersion;
        if (typeof plan.assignmentPatch.routeRevision !== "undefined") setPatch.routeRevision = plan.assignmentPatch.routeRevision;

        // CAS por activationVersion DENTRO de la tx: solo escribe si sigue siendo el leido (sin lost update).
        updatedAssignment = await VehicleRouteAssignmentModel.findOneAndUpdate(
          { _id: targetDoc._id, activationVersion: targetDoc.activationVersion },
          { $set: setPatch },
          { returnDocument: "after", session }
        ).lean();
        if (!updatedAssignment) { result = conflictResult("activation_version_conflict", targetView, vehicleView); return; }
      }

      let updatedVehicle = vehicleDoc;
      if (plan.projectVehicle && projection) {
        updatedVehicle = await VehicleModel.findByIdAndUpdate(
          vehicleDoc._id,
          { $set: { routeId: routeDoc._id, assignedRoute: projection, updatedAt: nowDate } },
          { returnDocument: "after", session }
        ).lean();
      }

      result = {
        outcome: plan.outcome,
        reason: null,
        applied: true,
        assignment: serializeVehicleRouteAssignment(updatedAssignment),
        vehicle: updatedVehicle ? serializeVehicle(updatedVehicle) : null,
        event: plan.event
      };
    });
    return result;
  } catch (error) {
    // Indice unico parcial ACTIVE: otra activacion gano la carrera -> already_active.
    if (error && error.code === 11000) return conflictResult("already_active");
    // Transacciones no disponibles (standalone) -> fail-closed, no escribir.
    if (isTransactionUnavailable(error)) return conflictResult("transaction_unavailable");
    throw error;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

module.exports = { activateVehicleRouteAssignmentMongo, isTransactionUnavailable };
