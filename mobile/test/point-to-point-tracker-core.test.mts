import assert from 'node:assert/strict';
import { distanceInMeters, evaluateTrackerTransition } from '../src/hooks/point-to-point-tracker-core.ts';

const origin = {
  latitude: 19.415,
  longitude: -99.073,
};

const destination = {
  latitude: 19.4452,
  longitude: -99.1513,
};

function testDistanceInMeters() {
  const distance = distanceInMeters(origin, {
    latitude: 19.4154,
    longitude: -99.0734,
  });

  assert.ok(distance > 0);
  assert.ok(distance < 100);
  console.log('ok - distanceInMeters calcula distancias cortas de forma estable');
}

function testStartTransition() {
  const transition = evaluateTrackerTransition({
    destination,
    nowIso: '2026-04-23T10:00:00.000Z',
    origin,
    trackedLocation: {
      latitude: 19.4151,
      longitude: -99.0731,
    },
    trackerStartedAt: null,
    trackerStatus: 'waiting_start',
    trackerZone: 'none',
  });

  assert.equal(transition.currentZone, 'start');
  assert.deepEqual(transition.event, {
    type: 'start',
    startedAt: '2026-04-23T10:00:00.000Z',
  });
  console.log('ok - el tracker inicia la vuelta al entrar al punto de salida');
}

function testFinishTransitionWithoutDuplicates() {
  const firstPass = evaluateTrackerTransition({
    destination,
    nowIso: '2026-04-23T10:28:00.000Z',
    origin,
    trackedLocation: {
      latitude: 19.4452,
      longitude: -99.15125,
    },
    trackerStartedAt: '2026-04-23T10:00:00.000Z',
    trackerStatus: 'in_progress',
    trackerZone: 'none',
  });
  const repeatedPass = evaluateTrackerTransition({
    destination,
    nowIso: '2026-04-23T10:28:05.000Z',
    origin,
    trackedLocation: {
      latitude: 19.44519,
      longitude: -99.15124,
    },
    trackerStartedAt: '2026-04-23T10:00:00.000Z',
    trackerStatus: 'in_progress',
    trackerZone: 'end',
  });

  assert.equal(firstPass.currentZone, 'end');
  assert.deepEqual(firstPass.event, {
    type: 'finish',
    finishedAt: '2026-04-23T10:28:00.000Z',
    durationSeconds: 1680,
  });
  assert.equal(repeatedPass.currentZone, 'end');
  assert.equal(repeatedPass.event, null);
  console.log('ok - el tracker cierra una sola vez al entrar al punto final');
}

testDistanceInMeters();
testStartTransition();
testFinishTransitionWithoutDuplicates();
