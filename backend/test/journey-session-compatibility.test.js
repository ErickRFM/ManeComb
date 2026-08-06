const assert = require("node:assert/strict");
const {
  buildLegacyJourneyMigrationPatch,
  serializeJourneySession
} = require("../src/domain/journey-session-compatibility");

function testRunningLegacySessionStaysRunning() {
  const session = serializeJourneySession({
    id: "session-running",
    status: "RUNNING",
    startedAt: "2026-08-06T12:00:00.000Z"
  });

  assert.equal(session.status, "RUNNING");
  assert.equal(session.startedAt, "2026-08-06T12:00:00.000Z");
  assert.equal(session.scheduledStartAt, null);
  assert.equal(session.legacyTiming, null);

  assert.deepEqual(buildLegacyJourneyMigrationPatch(session), {
    timingMigrationVersion: 1
  });
}

function testAssignedLegacyStartBecomesSchedule() {
  const source = {
    id: "session-assigned",
    status: "ASSIGNED",
    startedAt: "2026-08-06T13:00:00.000Z"
  };
  const session = serializeJourneySession(source);

  assert.equal(session.startedAt, "2026-08-06T13:00:00.000Z");
  assert.equal(
    session.legacyTiming.inferredScheduledStartAt,
    "2026-08-06T13:00:00.000Z"
  );

  assert.deepEqual(buildLegacyJourneyMigrationPatch(source), {
    scheduledStartAt: "2026-08-06T13:00:00.000Z",
    startedAt: null,
    timingMigrationVersion: 1
  });
}

function testNewAssignedSessionIsNotInvented() {
  const source = {
    id: "session-new",
    status: "ASSIGNED",
    scheduledStartAt: "2026-08-07T13:00:00.000Z",
    startedAt: null,
    timingMigrationVersion: 1
  };
  const session = serializeJourneySession(source);

  assert.equal(session.scheduledStartAt, "2026-08-07T13:00:00.000Z");
  assert.equal(session.startedAt, null);
  assert.equal(session.legacyTiming, null);
  assert.equal(buildLegacyJourneyMigrationPatch(source), null);
}

function testInvalidDatesFailClosed() {
  const session = serializeJourneySession({
    id: "session-invalid",
    status: "READY",
    scheduledStartAt: "not-a-date",
    startedAt: null
  });

  assert.equal(session.scheduledStartAt, null);
  assert.equal(session.startedAt, null);
}

testRunningLegacySessionStaysRunning();
testAssignedLegacyStartBecomesSchedule();
testNewAssignedSessionIsNotInvented();
testInvalidDatesFailClosed();

console.log("journey-session-compatibility.test.js: OK");
