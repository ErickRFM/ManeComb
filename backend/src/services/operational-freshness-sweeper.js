const { getOrganizationId, getRolesWithPermission } = require("../middlewares/access-control");
const { listOperationalUnits } = require("./operational-units-service");
const logger = require("./logger");

const OPERATIONAL_FRESHNESS_SWEEP_MS = 5000;
const FRESHNESS_SECONDS_BUCKET = 15;

function getConnectedOrganizationIds(io) {
  const organizations = new Set();
  io?.sockets?.sockets?.forEach?.((socket) => {
    const organizationId = getOrganizationId(socket?.data?.user);
    if (organizationId) organizations.add(String(organizationId));
  });
  return [...organizations];
}

function getAgeBucket(ageSeconds) {
  const age = Number(ageSeconds);
  if (!Number.isFinite(age) || age < 0) return "none";
  if (age <= 60) return `seconds:${Math.floor(age / FRESHNESS_SECONDS_BUCKET)}`;
  return `minutes:${Math.floor(age / 60)}`;
}

/**
 * El snapshot sigue siendo la autoridad. La firma solo decide si vale la pena
 * volver a emitirlo cuando no llego una posicion nueva. Incluye un bucket corto
 * de edad para que la UI avance de "en vivo" a "retrasado/perdido" sin polling
 * pesado en cada cliente.
 */
function getOperationalFreshnessSignature(unit) {
  const gps = unit?.gps || {};
  return [
    gps.freshness || "missing",
    gps.connectionState || "lost",
    getAgeBucket(gps.ageSeconds)
  ].join("|");
}

function emitFreshnessSnapshot(io, organizationId, unit, now = new Date()) {
  const payload = {
    unit,
    organizationId,
    emittedAt: now.toISOString(),
    reason: "freshness_tick"
  };

  getRolesWithPermission("canViewAnalytics").forEach((role) => {
    io.to(`org:${organizationId}:role:${role}`).emit("operational-unit:updated", payload);
  });

  if (unit?.driver?.id) {
    io.to(`user:${unit.driver.id}`).emit("operational-unit:updated", payload);
  }

  io.to("platform:admin").emit("operational-unit:updated", payload);
}

async function runOperationalFreshnessSweep({
  io,
  loadUnits,
  signatures,
  now = new Date()
}) {
  const organizationIds = getConnectedOrganizationIds(io);
  if (!organizationIds.length) return { organizations: 0, emitted: 0 };

  let emitted = 0;

  for (const organizationId of organizationIds) {
    const units = await loadUnits(organizationId, now);
    const currentKeys = new Set();

    for (const unit of Array.isArray(units) ? units : []) {
      if (!unit?.unitId) continue;
      const key = `${organizationId}:${unit.unitId}`;
      currentKeys.add(key);
      const signature = getOperationalFreshnessSignature(unit);
      const previousSignature = signatures.get(key);
      signatures.set(key, signature);

      // La primera lectura inicializa el reloj interno. El cliente que acaba de
      // conectar ya recibe el snapshot actual por REST; no duplicamos ese dato.
      if (previousSignature === undefined || previousSignature === signature) continue;

      emitFreshnessSnapshot(io, organizationId, unit, now);
      emitted += 1;
    }

    // Una unidad retirada no debe dejar una firma viva para siempre.
    for (const key of signatures.keys()) {
      if (key.startsWith(`${organizationId}:`) && !currentKeys.has(key)) {
        signatures.delete(key);
      }
    }
  }

  return { organizations: organizationIds.length, emitted };
}

function startOperationalFreshnessSweeper({
  io,
  store,
  server,
  intervalMs = OPERATIONAL_FRESHNESS_SWEEP_MS
}) {
  const signatures = new Map();
  let running = false;
  let stopped = false;

  const loadUnits = async (organizationId, now) => {
    const principal = {
      id: "system:gps-freshness",
      role: "owner",
      accountType: "company_owner",
      organizationId
    };
    return await listOperationalUnits({
      store,
      user: principal,
      organizationId,
      now
    });
  };

  const sweep = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await runOperationalFreshnessSweep({
        io,
        loadUnits,
        signatures,
        now: new Date()
      });
    } catch (error) {
      logger.error({
        action: "OperationalFreshnessSweep",
        module: "Tracking",
        status: "error",
        error
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void sweep();
  }, Math.max(1000, Number(intervalMs) || OPERATIONAL_FRESHNESS_SWEEP_MS));
  timer.unref?.();

  const stop = () => {
    stopped = true;
    clearInterval(timer);
    signatures.clear();
  };

  server?.once?.("close", stop);
  void sweep();

  return { stop, sweep, signatures };
}

module.exports = {
  FRESHNESS_SECONDS_BUCKET,
  OPERATIONAL_FRESHNESS_SWEEP_MS,
  getAgeBucket,
  getConnectedOrganizationIds,
  getOperationalFreshnessSignature,
  runOperationalFreshnessSweep,
  startOperationalFreshnessSweeper
};
