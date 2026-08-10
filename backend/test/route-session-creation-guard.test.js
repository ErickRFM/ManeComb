const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  installRouteSessionCreationGuard,
  isDriverEligibleForSession
} = require("../src/services/route-session-creation-guard");
const { beginDriverOffboardBarrier } = require("../src/services/driver-lifecycle");

const payload = {
  organizationId: "org-race",
  vehicleId: "vehicle-race",
  driverId: "driver-race",
  routeId: "route-race"
};

function driver(overrides = {}) {
  return {
    id: "driver-race",
    role: "driver",
    organizationId: "org-race",
    vehicleId: "vehicle-race",
    userStatus: "active",
    status: "online",
    ...overrides
  };
}

assert.equal(isDriverEligibleForSession(driver(), payload), true);
assert.equal(isDriverEligibleForSession(driver({ userStatus: "suspended" }), payload), false);
assert.equal(isDriverEligibleForSession(driver({ status: "offboarding" }), payload), false);
assert.equal(isDriverEligibleForSession(driver({ vehicleId: "vehicle-other" }), payload), false);

async function testStableCreation() {
  let createCalls = 0;
  const store = {
    getUserById: async () => driver(),
    createRouteSession: async () => {
      createCalls += 1;
      return {
        id: "session-stable",
        organizationId: "org-race",
        driverId: "driver-race",
        vehicleId: "vehicle-race",
        status: "RUNNING",
        creationApplied: true
      };
    }
  };
  installRouteSessionCreationGuard(store);
  const created = await store.createRouteSession(payload);
  assert.equal(created.id, "session-stable");
  assert.equal(createCalls, 1);
}

async function testPreCreateBarrier() {
  let createCalls = 0;
  const store = {
    getUserById: async () => driver({ userStatus: "suspended", status: "offboarding" }),
    createRouteSession: async () => {
      createCalls += 1;
      throw new Error("must not create");
    }
  };
  installRouteSessionCreationGuard(store);
  await assert.rejects(
    () => store.createRouteSession(payload),
    (error) => error?.code === "driver_lifecycle_changed" && error?.details?.stage === "before_create"
  );
  assert.equal(createCalls, 0);
}

async function testOffboardWinsDeferredCreate() {
  let currentDriver = driver();
  let releaseCreate;
  let createStartedResolve;
  let session = null;
  const events = [];
  const createStarted = new Promise((resolve) => { createStartedResolve = resolve; });
  const createReleased = new Promise((resolve) => { releaseCreate = resolve; });

  const store = {
    getUserById: async () => ({ ...currentDriver }),
    createRouteSession: async () => {
      createStartedResolve();
      await createReleased;
      session = {
        id: "session-race",
        organizationId: "org-race",
        driverId: "driver-race",
        vehicleId: "vehicle-race",
        status: "RUNNING",
        startedAt: "2026-08-10T15:00:00.000Z",
        creationApplied: true
      };
      return { ...session };
    },
    getRouteSessionById: async () => session ? { ...session } : null,
    updateRouteSession: async (sessionId, updates) => {
      assert.equal(sessionId, "session-race");
      assert.equal(updates.expectedStatus, "RUNNING");
      session = { ...session, ...updates };
      return { ...session, transitionApplied: true };
    },
    createRouteEvent: async (event) => {
      events.push(event);
      return event;
    }
  };

  installRouteSessionCreationGuard(store);
  const startAttempt = store.createRouteSession(payload);
  await createStarted;

  // Simula que Admin gana la baja mientras el request viejo ya pasó authenticate
  // y está esperando el plan/DB. El post-check debe cancelar lo recién creado.
  currentDriver = driver({ userStatus: "suspended", status: "offboarding" });
  releaseCreate();

  await assert.rejects(
    () => startAttempt,
    (error) => error?.code === "driver_lifecycle_changed" && error?.details?.stage === "after_create"
  );
  assert.equal(session.status, "CANCELLED");
  assert.ok(session.finishedAt, "la sesión tardía debe quedar terminal");
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "SESSION_FINISHED");
  assert.equal(events[0].metadata.source, "driver_lifecycle_guard");
}

async function testPersistentOffboardBarrier() {
  let updatePayload = null;
  const store = {
    getUserById: async () => driver(),
    updateUser: async (_userId, updates) => {
      updatePayload = updates;
      return driver(updates);
    }
  };

  const guarded = await beginDriverOffboardBarrier(store, {
    organizationId: "org-race",
    userId: "driver-race",
    impact: { conductor: driver(), assignedVehicle: { id: "vehicle-race" } }
  });
  assert.equal(guarded.userStatus, "suspended");
  assert.deepEqual(updatePayload, { status: "offboarding", userStatus: "suspended" });

  updatePayload = null;
  await beginDriverOffboardBarrier(store, {
    organizationId: "org-race",
    userId: "driver-race",
    impact: { conductor: driver({ vehicleId: null }), assignedVehicle: null }
  });
  assert.equal(updatePayload, null, "sin unidad no existe start-session válido que bloquear");
}

function testOffboardOrderingContract() {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/services/driver-lifecycle.js"),
    "utf8"
  );
  const barrier = source.indexOf("await beginDriverOffboardBarrier(store");
  const revoke = source.indexOf("await revokeAllSessions(userId, null, \"driver_offboarded\")");
  const refresh = source.indexOf("const guardedImpact = await previewDriverLifecycleImpact");
  const close = source.indexOf("const closedJourney = await closeActiveJourneyForOffboard");
  const finalize = source.indexOf("const result = await store.offboardDriverState");

  assert.ok(barrier >= 0 && barrier < revoke, "la barrera persistente debe preceder revocación/cierre");
  assert.ok(revoke < refresh && refresh < close, "la jornada se relee después de bloquear y revocar");
  assert.ok(close < finalize, "la baja final sólo libera unidad/cupo tras cerrar jornada");

  const backendStore = fs.readFileSync(
    path.resolve(__dirname, "../src/data/backend-store.js"),
    "utf8"
  );
  assert.match(backendStore, /installRouteSessionCreationGuard\(backendStore\)/);
}

async function main() {
  await testStableCreation();
  await testPreCreateBarrier();
  await testOffboardWinsDeferredCreate();
  await testPersistentOffboardBarrier();
  testOffboardOrderingContract();
  console.log("ok - driver offboard barrier defeats deferred route-session creation");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
