import assert from 'node:assert/strict';
import {
  classifyRouteDistance,
  distanceInMeters,
  evaluateTrackerTransition,
  projectPointOnRoute,
} from '../src/hooks/point-to-point-tracker-core.ts';

const origin = { latitude: 19.415, longitude: -99.073 };
const destination = { latitude: 19.4452, longitude: -99.1513 };

function testDistanceInMeters() {
  const distance = distanceInMeters(origin, { latitude: 19.4154, longitude: -99.0734 });
  assert.ok(distance > 0);
  assert.ok(distance < 100);
  console.log('ok - distanceInMeters calcula distancias cortas de forma estable');
}

function testStartTransition() {
  const transition = evaluateTrackerTransition({
    destination,
    nowIso: '2026-04-23T10:00:00.000Z',
    origin,
    trackedLocation: { latitude: 19.4151, longitude: -99.0731 },
    trackerStartedAt: null,
    trackerStatus: 'waiting_start',
    trackerZone: 'none',
  });
  assert.equal(transition.currentZone, 'start');
  assert.deepEqual(transition.event, { type: 'start', startedAt: '2026-04-23T10:00:00.000Z' });
  console.log('ok - el tracker inicia la vuelta al entrar al punto de salida');
}

function testFinishTransitionWithoutDuplicates() {
  const firstPass = evaluateTrackerTransition({
    destination,
    nowIso: '2026-04-23T10:28:00.000Z',
    origin,
    trackedLocation: { latitude: 19.4452, longitude: -99.15125 },
    trackerStartedAt: '2026-04-23T10:00:00.000Z',
    trackerStatus: 'in_progress',
    trackerZone: 'none',
  });
  const repeatedPass = evaluateTrackerTransition({
    destination,
    nowIso: '2026-04-23T10:28:05.000Z',
    origin,
    trackedLocation: { latitude: 19.44519, longitude: -99.15124 },
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

function testProjectPointOnRouteProgress() {
  const projection = projectPointOnRoute({
    point: { latitude: 19.0005, longitude: -99 },
    polyline: [
      { latitude: 19, longitude: -99 },
      { latitude: 19.001, longitude: -99 },
    ],
  });
  assert.ok(projection);
  assert.ok(projection.progressPercent >= 45 && projection.progressPercent <= 55);
  assert.ok(projection.distanceFromRoute < 5);
  assert.equal(projection.routeDistanceState, 'on_route');
  assert.equal(projection.isOffRoute, false);
  console.log('ok - snap-to-route calcula progreso sobre la geometria');
}

function testNearbyAlternativeDoesNotAlarm() {
  const projection = projectPointOnRoute({
    point: { latitude: 19.0005, longitude: -98.9985 },
    polyline: [
      { latitude: 19, longitude: -99 },
      { latitude: 19.001, longitude: -99 },
    ],
  });
  assert.ok(projection);
  assert.ok(projection.distanceFromRoute > 50);
  assert.equal(projection.routeDistanceState, 'possible_deviation');
  assert.equal(projection.isOffRoute, false);
  console.log('ok - una calle paralela se observa sin disparar OFF_ROUTE por una lectura');
}

function testHardDeviationCanWarnImmediately() {
  const projection = projectPointOnRoute({
    point: { latitude: 19.0005, longitude: -98.992 },
    polyline: [
      { latitude: 19, longitude: -99 },
      { latitude: 19.001, longitude: -99 },
    ],
  });
  assert.ok(projection);
  assert.equal(projection.routeDistanceState, 'hard_deviation');
  assert.equal(projection.isOffRoute, true);
  console.log('ok - una separacion obvia conserva advertencia inmediata de seguridad');
}

function testDistanceClassification() {
  assert.equal(classifyRouteDistance(40), 'on_route');
  assert.equal(classifyRouteDistance(90), 'near_route');
  assert.equal(classifyRouteDistance(250), 'possible_deviation');
  assert.equal(classifyRouteDistance(800), 'hard_deviation');
  console.log('ok - clasificacion cliente empata corredor tolerante');
}

testDistanceInMeters();
testStartTransition();
testFinishTransitionWithoutDuplicates();
testProjectPointOnRouteProgress();
testNearbyAlternativeDoesNotAlarm();
testHardDeviationCanWarnImmediately();
testDistanceClassification();
