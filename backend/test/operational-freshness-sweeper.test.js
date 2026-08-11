const assert = require("node:assert/strict");
const {
  FRESHNESS_SECONDS_BUCKET,
  OPERATIONAL_FRESHNESS_SWEEP_MS,
  createOperationalFreshnessLoader,
  createPlatformOrganizationIdsLoader,
  getConnectedOrganizationIds,
  getObservedOrganizationIds,
  getOperationalFreshnessSignature,
  hasPlatformAdminObserver,
  runOperationalFreshnessSweep
} = require("../src/services/operational-freshness-sweeper");

function createIo(users = []) {
  const emitted = [];
  const sockets = new Map(
    users.map((user, index) => [`socket-${index + 1}`, { data: { user }, rooms: new Set() }])
  );
  return {
    emitted,
    sockets: { sockets },
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        }
      };
    }
  };
}

function unit({ ageSeconds, connectionState, freshness }) {
  return {
    unitId: "vehicle-1",
    label: "C-1",
    driver: { id: "driver-1", name: "Conductor" },
    gps: {
      ageSeconds,
      connectionState,
      freshness,
      lat: 19.31,
      lng: -98.24
    }
  };
}

async function main() {
  assert.equal(
    OPERATIONAL_FRESHNESS_SWEEP_MS,
    5000,
    "el sweep global queda como respaldo; los deadlines por unidad hacen la transicion precisa"
  );
  assert.equal(FRESHNESS_SECONDS_BUCKET, 15);

  const tenantLoader = createOperationalFreshnessLoader({
    getLiveLocations: async () => ({
      vehicles: [
        {
          id: "vehicle-org-1",
          organizationId: "org-1",
          code: "C-1",
          location: { latitude: 19.31, longitude: -98.24 },
          locationTimestamp: "2026-08-10T07:29:55.000Z",
          locationReceivedAt: "2026-08-10T07:29:55.000Z"
        },
        {
          id: "vehicle-org-2",
          organizationId: "org-2",
          code: "C-2",
          location: { latitude: 19.32, longitude: -98.25 },
          locationTimestamp: "2026-08-10T07:29:55.000Z",
          locationReceivedAt: "2026-08-10T07:29:55.000Z"
        }
      ],
      routes: []
    }),
    listIncidents: async () => [],
    listUsers: async () => [],
    listRouteSessions: async () => []
  });
  const tenantUnits = await tenantLoader("org-1", new Date("2026-08-10T07:30:00.000Z"));
  assert.deepEqual(
    tenantUnits.map((entry) => entry.unitId),
    ["vehicle-org-1"],
    "el sweeper nunca puede mezclar unidades de otra organizacion"
  );

  const organizationLoader = createPlatformOrganizationIdsLoader({
    listUsers: async () => [
      { id: "u1", organizationId: "org-1" },
      { id: "u2", organizationId: "org-2" }
    ],
    listCommercialOrders: async () => [
      { id: "order-3", organizationId: "org-3" },
      { id: "order-duplicate", organizationId: "org-2" }
    ]
  });
  assert.deepEqual((await organizationLoader()).sort(), ["org-1", "org-2", "org-3"]);

  const io = createIo([
    { id: "owner-1", role: "owner", organizationId: "org-1" },
    { id: "admin-1", role: "admin", organizationId: "org-1" },
    { id: "owner-2", role: "owner", organizationId: "org-2" },
    { id: "platform", role: "admin" }
  ]);
  assert.deepEqual(getConnectedOrganizationIds(io).sort(), ["org-1", "org-2"]);
  assert.equal(hasPlatformAdminObserver(io), false, "un socket sin unirse al room global no cuenta como observador");
  io.sockets.sockets.get("socket-4").rooms.add("platform:admin");
  assert.equal(hasPlatformAdminObserver(io), true);
  assert.deepEqual(
    (await getObservedOrganizationIds({ io, loadOrganizationIds: organizationLoader })).sort(),
    ["org-1", "org-2", "org-3"],
    "Admin Global debe ampliar el sweep a todas las organizaciones conocidas"
  );

  const signatures = new Map();
  let state = {
    "org-1": [unit({ ageSeconds: 2, connectionState: "live", freshness: "fresh" })],
    "org-2": [],
    "org-3": []
  };
  const loadCalls = [];
  const loadUnits = async (organizationId) => {
    loadCalls.push(organizationId);
    return state[organizationId] || [];
  };

  const first = await runOperationalFreshnessSweep({
    io,
    loadUnits,
    loadOrganizationIds: organizationLoader,
    signatures,
    now: new Date("2026-08-10T07:30:00.000Z")
  });
  assert.equal(first.organizations, 3);
  assert.equal(first.emitted, 0, "la primera lectura solo inicializa firmas");
  assert.equal(io.emitted.length, 0);

  state = {
    ...state,
    "org-1": [unit({ ageSeconds: 7, connectionState: "live", freshness: "fresh" })]
  };
  const sameBucket = await runOperationalFreshnessSweep({ io, loadUnits, loadOrganizationIds: organizationLoader, signatures });
  assert.equal(sameBucket.emitted, 0, "no se emite ruido dentro del mismo bucket vivo");

  state = {
    ...state,
    "org-1": [unit({ ageSeconds: 9, connectionState: "delayed", freshness: "fresh" })]
  };
  const delayed = await runOperationalFreshnessSweep({ io, loadUnits, loadOrganizationIds: organizationLoader, signatures });
  assert.equal(delayed.emitted, 1);
  assert.ok(
    io.emitted.some(
      (entry) =>
        entry.event === "operational-unit:updated" &&
        entry.payload.reason === "freshness_tick" &&
        entry.payload.unit.gps.connectionState === "delayed"
    ),
    "el reconciliador conserva la transicion aunque el deadline por unidad se pierda"
  );
  assert.ok(
    io.emitted.some((entry) => entry.room === "user:driver-1"),
    "el propio conductor conserva su snapshot aunque su rol no vea toda la flota"
  );

  const emittedAfterDelayed = io.emitted.length;
  state = {
    ...state,
    "org-1": [unit({ ageSeconds: 12, connectionState: "delayed", freshness: "fresh" })]
  };
  const repeated = await runOperationalFreshnessSweep({ io, loadUnits, loadOrganizationIds: organizationLoader, signatures });
  assert.equal(repeated.emitted, 0);
  assert.equal(io.emitted.length, emittedAfterDelayed);

  state = {
    ...state,
    "org-1": [unit({ ageSeconds: 16, connectionState: "stale", freshness: "stale" })]
  };
  const stale = await runOperationalFreshnessSweep({ io, loadUnits, loadOrganizationIds: organizationLoader, signatures });
  assert.equal(stale.emitted, 1);
  assert.equal(
    getOperationalFreshnessSignature(state["org-1"][0]),
    "stale|stale|seconds:1"
  );

  const platformOnlyIo = createIo([{ id: "platform-only", role: "admin" }]);
  platformOnlyIo.sockets.sockets.get("socket-1").rooms.add("platform:admin");
  const platformOnlySignatures = new Map([
    ["org-1:vehicle-1", "fresh|live|seconds:0"]
  ]);
  const platformOnlyState = {
    "org-1": [unit({ ageSeconds: 16, connectionState: "stale", freshness: "stale" })],
    "org-2": [],
    "org-3": []
  };
  const platformOnly = await runOperationalFreshnessSweep({
    io: platformOnlyIo,
    signatures: platformOnlySignatures,
    loadOrganizationIds: organizationLoader,
    loadUnits: async (organizationId) => platformOnlyState[organizationId] || [],
    now: new Date("2026-08-10T07:31:00.000Z")
  });
  assert.equal(platformOnly.organizations, 3);
  assert.equal(platformOnly.emitted, 1);
  assert.ok(
    platformOnlyIo.emitted.some(
      (entry) => entry.room === "platform:admin" && entry.payload.unit.gps.connectionState === "stale"
    ),
    "Admin Global solo debe ver avanzar frescura aun cuando ningun tenant tenga socket conectado"
  );

  const noSockets = createIo([]);
  let noSocketLoads = 0;
  let noSocketOrganizationLoads = 0;
  const idle = await runOperationalFreshnessSweep({
    io: noSockets,
    signatures: new Map(),
    loadOrganizationIds: async () => {
      noSocketOrganizationLoads += 1;
      return ["org-1"];
    },
    loadUnits: async () => {
      noSocketLoads += 1;
      return [];
    }
  });
  assert.equal(idle.organizations, 0);
  assert.equal(idle.emitted, 0);
  assert.equal(noSocketLoads, 0, "sin clientes conectados no se consulta la flota");
  assert.equal(noSocketOrganizationLoads, 0, "sin observador global no se enumera el universo de tenants");

  assert.ok(loadCalls.includes("org-1") && loadCalls.includes("org-2") && loadCalls.includes("org-3"));
  console.log("ok - freshness sweeper queda como reconciliador sin polling global agresivo");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});