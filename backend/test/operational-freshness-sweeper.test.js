const assert = require("node:assert/strict");
const {
  FRESHNESS_SECONDS_BUCKET,
  getConnectedOrganizationIds,
  getOperationalFreshnessSignature,
  runOperationalFreshnessSweep
} = require("../src/services/operational-freshness-sweeper");

function createIo(users = []) {
  const emitted = [];
  const sockets = new Map(
    users.map((user, index) => [`socket-${index + 1}`, { data: { user } }])
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
  assert.equal(FRESHNESS_SECONDS_BUCKET, 15);

  const io = createIo([
    { id: "owner-1", role: "owner", organizationId: "org-1" },
    { id: "admin-1", role: "admin", organizationId: "org-1" },
    { id: "owner-2", role: "owner", organizationId: "org-2" },
    { id: "platform", role: "admin" }
  ]);
  assert.deepEqual(getConnectedOrganizationIds(io).sort(), ["org-1", "org-2"]);

  const signatures = new Map();
  let state = {
    "org-1": [unit({ ageSeconds: 2, connectionState: "live", freshness: "fresh" })],
    "org-2": []
  };
  const loadCalls = [];
  const loadUnits = async (organizationId) => {
    loadCalls.push(organizationId);
    return state[organizationId] || [];
  };

  const first = await runOperationalFreshnessSweep({
    io,
    loadUnits,
    signatures,
    now: new Date("2026-08-10T07:30:00.000Z")
  });
  assert.equal(first.organizations, 2);
  assert.equal(first.emitted, 0, "la primera lectura solo inicializa firmas");
  assert.equal(io.emitted.length, 0);

  state = {
    ...state,
    "org-1": [unit({ ageSeconds: 10, connectionState: "live", freshness: "fresh" })]
  };
  const sameBucket = await runOperationalFreshnessSweep({ io, loadUnits, signatures });
  assert.equal(sameBucket.emitted, 0, "no se emite ruido dentro del mismo bucket vivo");

  state = {
    ...state,
    "org-1": [unit({ ageSeconds: 16, connectionState: "delayed", freshness: "fresh" })]
  };
  const delayed = await runOperationalFreshnessSweep({ io, loadUnits, signatures });
  assert.equal(delayed.emitted, 1);
  assert.ok(
    io.emitted.some(
      (entry) =>
        entry.event === "operational-unit:updated" &&
        entry.payload.reason === "freshness_tick" &&
        entry.payload.unit.gps.connectionState === "delayed"
    ),
    "el cliente recibe la transicion aunque no llegue una posicion nueva"
  );
  assert.ok(
    io.emitted.some((entry) => entry.room === "user:driver-1"),
    "el propio conductor conserva su snapshot aunque su rol no vea toda la flota"
  );

  const emittedAfterDelayed = io.emitted.length;
  state = {
    ...state,
    "org-1": [unit({ ageSeconds: 20, connectionState: "delayed", freshness: "fresh" })]
  };
  const repeated = await runOperationalFreshnessSweep({ io, loadUnits, signatures });
  assert.equal(repeated.emitted, 0);
  assert.equal(io.emitted.length, emittedAfterDelayed);

  state = {
    ...state,
    "org-1": [unit({ ageSeconds: 31, connectionState: "stale", freshness: "stale" })]
  };
  const stale = await runOperationalFreshnessSweep({ io, loadUnits, signatures });
  assert.equal(stale.emitted, 1);
  assert.equal(
    getOperationalFreshnessSignature(state["org-1"][0]),
    "stale|stale|seconds:2"
  );

  const noSockets = createIo([]);
  let noSocketLoads = 0;
  const idle = await runOperationalFreshnessSweep({
    io: noSockets,
    signatures: new Map(),
    loadUnits: async () => {
      noSocketLoads += 1;
      return [];
    }
  });
  assert.equal(idle.organizations, 0);
  assert.equal(idle.emitted, 0);
  assert.equal(noSocketLoads, 0, "sin clientes conectados no se consulta la flota");

  assert.ok(loadCalls.includes("org-1") && loadCalls.includes("org-2"));
  console.log("ok - freshness sweeper emite solo cambios utiles para organizaciones conectadas");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
