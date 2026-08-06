const assert = require("assert");
const {
  canTransitionJourney,
  isJourneyActive,
  isJourneyTerminal,
  resolveJourneyTransitionPatch
} = require("../src/domain/journey-lifecycle");

function testAllowedTransitions() {
  const allowed = [
    ["ASSIGNED", "READY"],
    ["ASSIGNED", "CANCELLED"],
    ["READY", "RUNNING"],
    ["READY", "CANCELLED"],
    ["RUNNING", "PAUSED"],
    ["RUNNING", "FINISHED"],
    ["RUNNING", "CANCELLED"],
    ["PAUSED", "RUNNING"],
    ["PAUSED", "FINISHED"],
    ["PAUSED", "CANCELLED"]
  ];

  for (const [currentStatus, nextStatus] of allowed) {
    assert.deepStrictEqual(canTransitionJourney(currentStatus, nextStatus).ok, true);
  }
}

function testRejectedTransitions() {
  const rejected = [
    ["ASSIGNED", "RUNNING"],
    ["READY", "PAUSED"],
    ["RUNNING", "READY"],
    ["FINISHED", "RUNNING"],
    ["CANCELLED", "READY"],
    ["UNKNOWN", "READY"]
  ];

  for (const [currentStatus, nextStatus] of rejected) {
    assert.strictEqual(canTransitionJourney(currentStatus, nextStatus).ok, false);
  }
}

function testIdempotency() {
  const decision = canTransitionJourney("RUNNING", "RUNNING");
  assert.strictEqual(decision.ok, true);
  assert.strictEqual(decision.idempotent, true);

  const resolved = resolveJourneyTransitionPatch({
    currentStatus: "RUNNING",
    nextStatus: "RUNNING",
    actorId: "driver-1"
  });
  assert.strictEqual(resolved.patch, null);
}

function testConfirmationPatch() {
  const resolved = resolveJourneyTransitionPatch({
    currentStatus: "ASSIGNED",
    nextStatus: "READY",
    actorId: "driver-1",
    now: "2026-08-06T13:00:00.000Z"
  });

  assert.strictEqual(resolved.ok, true);
  assert.strictEqual(resolved.patch.status, "READY");
  assert.strictEqual(resolved.patch.confirmedBy, "driver-1");
  assert.strictEqual(resolved.patch.confirmedAt, "2026-08-06T13:00:00.000Z");
  assert.strictEqual(resolved.patch.startedAt, undefined);
}

function testStartPatch() {
  const resolved = resolveJourneyTransitionPatch({
    currentStatus: "READY",
    nextStatus: "RUNNING",
    actorId: "driver-1",
    now: "2026-08-06T13:15:00.000Z"
  });

  assert.strictEqual(resolved.ok, true);
  assert.strictEqual(resolved.patch.startedBy, "driver-1");
  assert.strictEqual(resolved.patch.startedAt, "2026-08-06T13:15:00.000Z");
  assert.strictEqual(resolved.patch.finishedAt, undefined);
}

function testFinishPatch() {
  const resolved = resolveJourneyTransitionPatch({
    currentStatus: "RUNNING",
    nextStatus: "FINISHED",
    actorId: "driver-1",
    now: "2026-08-06T20:00:00.000Z",
    finishReason: "completed",
    finishedOdometer: 12045,
    endBattery: 72,
    endGpsAccuracy: 8
  });

  assert.strictEqual(resolved.ok, true);
  assert.strictEqual(resolved.patch.finishedBy, "driver-1");
  assert.strictEqual(resolved.patch.finishedAt, "2026-08-06T20:00:00.000Z");
  assert.strictEqual(resolved.patch.finishedOdometer, 12045);
  assert.strictEqual(resolved.patch.endBattery, 72);
  assert.strictEqual(resolved.patch.endGpsAccuracy, 8);
}

function testStatusGroups() {
  for (const status of ["ASSIGNED", "READY", "RUNNING", "PAUSED"]) {
    assert.strictEqual(isJourneyActive(status), true);
    assert.strictEqual(isJourneyTerminal(status), false);
  }

  for (const status of ["FINISHED", "CANCELLED"]) {
    assert.strictEqual(isJourneyActive(status), false);
    assert.strictEqual(isJourneyTerminal(status), true);
  }
}

testAllowedTransitions();
testRejectedTransitions();
testIdempotency();
testConfirmationPatch();
testStartPatch();
testFinishPatch();
testStatusGroups();

console.log("journey-lifecycle.test.js: OK");
