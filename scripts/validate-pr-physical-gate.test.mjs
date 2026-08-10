import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePhysicalGate } from './validate-pr-physical-gate.mjs';

function pr(overrides = {}) {
  return {
    number: 999,
    draft: false,
    body: '',
    ...overrides,
  };
}

test('Draft can keep a pending physical gate', () => {
  const result = validatePhysicalGate(pr({
    draft: true,
    body: 'PHYSICAL_GATE: PENDING\nPHYSICAL_EVIDENCE: Pending Android device test',
  }));
  assert.equal(result.ok, true);
});

test('Ready without a physical declaration fails closed', () => {
  const result = validatePhysicalGate(pr({ body: 'CI is green.' }));
  assert.equal(result.ok, false);
  assert.match(result.message, /no canonical PHYSICAL_GATE/i);
});

test('Ready with pending physical work fails', () => {
  const result = validatePhysicalGate(pr({
    body: 'PHYSICAL_GATE: PENDING\nPHYSICAL_EVIDENCE: Android retest pending',
  }));
  assert.equal(result.ok, false);
  assert.match(result.message, /Ready while PHYSICAL_GATE is PENDING/i);
});

test('Ready ACCEPTED_PENDING requires evidence and explicit acceptance', () => {
  const missingAcceptance = validatePhysicalGate(pr({
    body: [
      'PHYSICAL_GATE: ACCEPTED_PENDING',
      'PHYSICAL_EVIDENCE: Release APK still needs airplane-mode GPS replay on a real Android device.',
    ].join('\n'),
  }));
  assert.equal(missingAcceptance.ok, false);
  assert.match(missingAcceptance.message, /PHYSICAL_ACCEPTANCE/i);

  const bareAcceptance = validatePhysicalGate(pr({
    body: [
      'PHYSICAL_GATE: ACCEPTED_PENDING',
      'PHYSICAL_EVIDENCE: Release APK still needs airplane-mode GPS replay on a real Android device.',
      'PHYSICAL_ACCEPTANCE: pending',
    ].join('\n'),
  }));
  assert.equal(bareAcceptance.ok, false);

  const valid = validatePhysicalGate(pr({
    body: [
      'PHYSICAL_GATE: ACCEPTED_PENDING',
      'PHYSICAL_EVIDENCE: Release APK still needs airplane-mode GPS replay on a real Android device.',
      'PHYSICAL_ACCEPTANCE: Repository owner requested merge of automated-certified code so the merged release can be installed and physically tested.',
    ].join('\n'),
  }));
  assert.equal(valid.ok, true);
  assert.match(valid.message, /explicitly accepted/i);
});

test('Ready rejects duplicate or conflicting physical gate declarations', () => {
  const duplicate = validatePhysicalGate(pr({
    body: [
      'PHYSICAL_GATE: PASS',
      'PHYSICAL_EVIDENCE: OnePlus 9 Android release APK PASS.',
      'PHYSICAL_GATE: PENDING',
    ].join('\n'),
  }));
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.message, /exactly one PHYSICAL_GATE/i);
});

test('Ready rejects duplicate physical evidence declarations', () => {
  const duplicate = validatePhysicalGate(pr({
    body: [
      'PHYSICAL_GATE: PASS',
      'PHYSICAL_EVIDENCE: OnePlus 9 Android release APK PASS.',
      'PHYSICAL_EVIDENCE: second conflicting evidence line',
    ].join('\n'),
  }));
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.message, /exactly one PHYSICAL_EVIDENCE/i);
});

test('Ready PASS requires concrete evidence', () => {
  const missing = validatePhysicalGate(pr({ body: 'PHYSICAL_GATE: PASS' }));
  assert.equal(missing.ok, false);

  const valid = validatePhysicalGate(pr({
    body: [
      'PHYSICAL_GATE: PASS',
      'PHYSICAL_EVIDENCE: OnePlus 9 Android release APK; lockscreen FCM and reconnect matrix PASS.',
    ].join('\n'),
  }));
  assert.equal(valid.ok, true);
});

test('Ready N/A requires a reason, not a bare N/A', () => {
  const bare = validatePhysicalGate(pr({
    body: 'PHYSICAL_GATE: N/A\nPHYSICAL_EVIDENCE: N/A',
  }));
  assert.equal(bare.ok, false);

  const valid = validatePhysicalGate(pr({
    body: [
      'PHYSICAL_GATE: N/A',
      'PHYSICAL_EVIDENCE: CI-only contract change; no runtime behavior or artifact changes.',
    ].join('\n'),
  }));
  assert.equal(valid.ok, true);
});
