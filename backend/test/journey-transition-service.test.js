const assert = require("assert");
const {
  JourneyTransitionError,
  transitionJourneySession
} = require("../src/services/journey-transition-service");

function createStore(initialSession) {
  let session = { ...initialSession };

  return {
    async getRouteSessionById(id) {
      return String(id) === String(session.id) ? { ...session } : null;
    },
    async updateRouteSession(id, patch) {
      if (String(id) !== String(session.id)) return null;
      if (patch.expectedStatus && patch.expectedStatus !== session.status) {
        return { ...session, transitionApplied: false };
      }
      session = { ...session, ...patch };
      delete session.expectedStatus;
      return { ...session, transitionApplied: true };
    }
  };
}

async function expectError(promise, code) {
  try {
    await promise;
    assert.fail(`Se esperaba error ${code}`);
  } catch (error) {
    assert.ok(error instanceof JourneyTransitionError);
    assert.strictEqual(error.code, code);
  }
}

async function testDriverConfirmsOwnJourney() {
  const store = createStore({
    id: "session-1",
    organizationId: "org-1",
    driverId: "driver-1",
    status: "ASSIGNED"
  });

  const result = await transitionJourneySession({
    store,
    sessionId: "session-1",
    actor: { id: "driver-1", role: "driver", organizationId: "org-1" },
    nextStatus: "READY",
    now: "2026-08-06T13:00:00.000Z"
  });

  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.session.status, "READY");
  assert.strictEqual(result.session.confirmedBy, "driver-1");
}

async function testDriverCannotChangeAnotherJourney() {
  const store = createStore({
    id: "session-1",
    organizationId: "org-1",
    driverId: "driver-1",
    status: "ASSIGNED"
  });

  await expectError(
    transitionJourneySession({
      store,
      sessionId: "session-1",
      actor: { id: "driver-2", role: "driver", organizationId: "org-1" },
      nextStatus: "READY"
    }),
    "driver_mismatch"
  );
}

async function testTenantMismatchFailsClosed() {
  const store = createStore({
    id: "session-1",
    organizationId: "org-1",
    driverId: "driver-1",
    status: "READY"
  });

  await expectError(
    transitionJourneySession({
      store,
      sessionId: "session-1",
      actor: { id: "admin-2", role: "admin", organizationId: "org-2" },
      nextStatus: "CANCELLED"
    }),
    "tenant_mismatch"
  );
}

// Regresion: `routeSessionSchema.organizationId` es `{ type: String, default: "" }`,
// no obligatorio. Antes la guarda exigia que AMBOS organizationId fueran truthy,
// asi que una jornada sin organizacion saltaba la comprobacion entera y cualquier
// usuario operativo de cualquier tenant podia transicionarla. Debe fallar cerrado.
async function testSessionWithoutOrganizationFailsClosed() {
  for (const orphanOrganizationId of ["", null, undefined]) {
    const store = createStore({
      id: "session-1",
      organizationId: orphanOrganizationId,
      driverId: "driver-1",
      status: "READY"
    });

    await expectError(
      transitionJourneySession({
        store,
        sessionId: "session-1",
        actor: { id: "admin-9", role: "admin", organizationId: "org-ajena" },
        nextStatus: "CANCELLED"
      }),
      "tenant_mismatch"
    );
  }
}

async function testSameStatusIsIdempotent() {
  const store = createStore({
    id: "session-1",
    organizationId: "org-1",
    driverId: "driver-1",
    status: "RUNNING"
  });

  const result = await transitionJourneySession({
    store,
    sessionId: "session-1",
    actor: { id: "driver-1", role: "driver", organizationId: "org-1" },
    nextStatus: "RUNNING"
  });

  assert.strictEqual(result.applied, false);
  assert.strictEqual(result.idempotent, true);
}

async function testTerminalCannotReopen() {
  const store = createStore({
    id: "session-1",
    organizationId: "org-1",
    driverId: "driver-1",
    status: "FINISHED"
  });

  await expectError(
    transitionJourneySession({
      store,
      sessionId: "session-1",
      actor: { id: "admin-1", role: "admin", organizationId: "org-1" },
      nextStatus: "RUNNING"
    }),
    "terminal_status"
  );
}

async function run() {
  await testDriverConfirmsOwnJourney();
  await testDriverCannotChangeAnotherJourney();
  await testTenantMismatchFailsClosed();
  await testSessionWithoutOrganizationFailsClosed();
  await testSameStatusIsIdempotent();
  await testTerminalCannotReopen();
  console.log("journey-transition-service.test.js: OK");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
