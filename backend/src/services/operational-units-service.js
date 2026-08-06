const {
  ACTIVE_SESSION_STATUSES,
  buildOperationalUnitSnapshot
} = require("../domain/operational-unit-snapshot");
const { attachOperationalJourney } = require("../domain/operational-journey-snapshot");

/**
 * Ensambla la proyeccion operacional canonica.
 *
 * Toda superficie (REST y Socket.IO, Mobile y Portal) recibe exactamente el
 * objeto que produce este servicio. No se admiten merges parciales.
 */

const MAX_SESSION_LOOKUP = 500;

function indexById(items, key) {
  const index = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = item?.[key];
    if (id) index.set(String(id), item);
  });
  return index;
}

function groupBy(items, key) {
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = item?.[key];
    if (!id) return;
    const bucket = groups.get(String(id));
    if (bucket) bucket.push(item);
    else groups.set(String(id), [item]);
  });
  return groups;
}

function pickActiveSession(sessions) {
  return (
    (Array.isArray(sessions) ? sessions : [])
      .filter((session) => ACTIVE_SESSION_STATUSES.has(String(session?.status ?? "").toUpperCase()))
      .sort(
        (left, right) =>
          new Date(right.updatedAt || right.startedAt || right.scheduledStartAt || 0) -
          new Date(left.updatedAt || left.startedAt || left.scheduledStartAt || 0)
      )[0] || null
  );
}

/**
 * Reune de una sola pasada todo lo que el snapshot necesita.
 * @param {object} params
 * @param {object} params.store
 * @param {object} params.user            Usuario autenticado, para alcance de tenant.
 * @param {string} params.organizationId
 * @param {(user: object, items: Array) => Array} [params.filterTenantList]
 */
async function loadOperationalContext({ store, user, organizationId, filterTenantList }) {
  const [live, incidents, users, sessions] = await Promise.all([
    store.getLiveLocations(user),
    Promise.resolve(store.listIncidents(user)).catch(() => []),
    Promise.resolve(store.listUsers(user)).catch(() => []),
    Promise.resolve(
      store.listRouteSessions({ organizationId, limit: MAX_SESSION_LOOKUP })
    ).catch(() => [])
  ]);

  const rawVehicles = live?.vehicles || [];
  const vehicles = typeof filterTenantList === "function" ? filterTenantList(user, rawVehicles) : rawVehicles;
  const sessionList = Array.isArray(sessions) ? sessions : sessions?.items || [];

  return {
    vehicles,
    routesById: indexById(live?.routes || [], "id"),
    usersById: indexById(Array.isArray(users) ? users : users?.items || [], "id"),
    incidentsByVehicle: groupBy(Array.isArray(incidents) ? incidents : incidents?.items || [], "vehicleId"),
    sessionsByVehicle: groupBy(sessionList, "vehicleId")
  };
}

function resolveOperationalRouteId(vehicle, activeSession) {
  // La asignacion vigente de la unidad es la autoridad para dibujar y operar la
  // ruta. Una Jornada ASSIGNED/READY puede coexistir antes de iniciar, pero no
  // debe sustituir silenciosamente la geometria ya activa del vehiculo.
  return vehicle?.assignedRoute?.routeId || vehicle?.routeId || activeSession?.routeId || null;
}

function snapshotFromContext(vehicle, context, now) {
  const vehicleId = String(vehicle?.id ?? vehicle?._id ?? "");
  const activeSession = pickActiveSession(context.sessionsByVehicle.get(vehicleId));
  const routeId = resolveOperationalRouteId(vehicle, activeSession);
  const driverId = activeSession?.driverId || vehicle?.driverId || null;

  const snapshot = buildOperationalUnitSnapshot({
    vehicle,
    route: routeId ? context.routesById.get(String(routeId)) || null : null,
    activeSession,
    driver: driverId ? context.usersById.get(String(driverId)) || null : null,
    incidents: context.incidentsByVehicle.get(vehicleId) || [],
    now
  });

  return attachOperationalJourney(snapshot, activeSession, now);
}

/**
 * Coleccion completa de snapshots del tenant.
 * Incluye unidades sin GPS, sin ruta y sin conductor: el filtrado por
 * visibilidad es responsabilidad del contrato, no del consumidor.
 */
async function listOperationalUnits({ store, user, organizationId, filterTenantList, now = new Date() }) {
  const context = await loadOperationalContext({ store, user, organizationId, filterTenantList });
  return context.vehicles
    .map((vehicle) => snapshotFromContext(vehicle, context, now))
    .filter((snapshot) => snapshot.visibility === "visible")
    .sort((left, right) => left.label.localeCompare(right.label, "es", { numeric: true }));
}

async function getOperationalUnit({ store, user, organizationId, filterTenantList, unitId, now = new Date() }) {
  const context = await loadOperationalContext({ store, user, organizationId, filterTenantList });
  const vehicle = context.vehicles.find((entry) => String(entry?.id ?? entry?._id ?? "") === String(unitId));
  return vehicle ? snapshotFromContext(vehicle, context, now) : null;
}

/**
 * Snapshot de una sola unidad, para emision en tiempo real.
 *
 * Produce exactamente el mismo objeto que la ruta REST: si estos dos caminos
 * divergen, vuelve el problema que esta RC intenta cerrar.
 *
 * `listIncidents` exige un principal para el alcance de tenant; en emision no
 * hay usuario en sesion, asi que se usa un principal de sistema acotado a la
 * organizacion del propio vehiculo.
 */
async function buildSnapshotForVehicle({ store, vehicle, organizationId, now = new Date() }) {
  if (!vehicle) return null;

  const vehicleId = String(vehicle.id ?? vehicle._id ?? "");
  const org = String(organizationId || vehicle.organizationId || "").trim();
  const systemPrincipal = { id: "system", role: "owner", organizationId: org };

  const [sessions, incidents] = await Promise.all([
    Promise.resolve(store.listRouteSessions({ organizationId: org, vehicleId, limit: 25 })).catch(() => []),
    Promise.resolve(store.listIncidents(systemPrincipal)).catch(() => [])
  ]);

  const sessionList = Array.isArray(sessions) ? sessions : sessions?.items || [];
  const activeSession = pickActiveSession(sessionList);
  const routeId = resolveOperationalRouteId(vehicle, activeSession);
  const driverId = activeSession?.driverId || vehicle.driverId || null;
  const incidentList = Array.isArray(incidents) ? incidents : incidents?.items || [];

  const [route, driver] = await Promise.all([
    routeId ? Promise.resolve(store.getRouteById(routeId)).catch(() => null) : null,
    driverId ? Promise.resolve(store.getUserById(driverId)).catch(() => null) : null
  ]);

  const snapshot = buildOperationalUnitSnapshot({
    vehicle,
    route,
    activeSession,
    driver,
    incidents: incidentList.filter((incident) => String(incident?.vehicleId || "") === vehicleId),
    now
  });

  return attachOperationalJourney(snapshot, activeSession, now);
}

/**
 * Emite `operational-unit:updated` con el snapshot completo.
 * No se emiten merges parciales: el consumidor reemplaza la unidad entera.
 */
async function emitOperationalUnitUpdate({ io, store, vehicle, organizationId, getRolesWithPermission }) {
  if (!io || !vehicle) return null;

  let snapshot = null;
  try {
    snapshot = await buildSnapshotForVehicle({ store, vehicle, organizationId });
  } catch (error) {
    return null;
  }

  if (!snapshot) return null;

  const org = String(organizationId || vehicle.organizationId || "").trim();
  const payload = { unit: snapshot, organizationId: org, emittedAt: new Date().toISOString() };

  if (org && typeof getRolesWithPermission === "function") {
    getRolesWithPermission("canViewAnalytics").forEach((role) => {
      io.to(`org:${org}:role:${role}`).emit("operational-unit:updated", payload);
    });
    if (snapshot.driver?.id) {
      io.to(`user:${snapshot.driver.id}`).emit("operational-unit:updated", payload);
    }
  }

  io.to("platform:admin").emit("operational-unit:updated", payload);
  return snapshot;
}

module.exports = {
  buildSnapshotForVehicle,
  emitOperationalUnitUpdate,
  getOperationalUnit,
  listOperationalUnits,
  loadOperationalContext,
  pickActiveSession,
  resolveOperationalRouteId,
  snapshotFromContext
};
