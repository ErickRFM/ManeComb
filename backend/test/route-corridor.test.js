const assert = require("node:assert/strict");
const {
  ROUTE_STATE,
  calculateVehicleRouteProgress,
  projectPointOnRoute,
  resolveRouteState
} = require("../src/services/route-progress");

function baseVehicle(overrides = {}) {
  return {
    activeRouteProgress: null,
    assignedRoute: {
      route: {
        distanceMeters: 2200,
        durationSeconds: 300,
        durationInTrafficSeconds: 330,
        polyline: [
          { latitude: 19.4, longitude: -99.1 },
          { latitude: 19.42, longitude: -99.1 }
        ]
      }
    },
    ...overrides
  };
}

(() => {
  const projection = projectPointOnRoute({
    point: { latitude: 19.41, longitude: -99.1 },
    polyline: baseVehicle().assignedRoute.route.polyline
  });
  assert.ok(projection, "proyeccion disponible");
  assert.ok(Number.isFinite(projection.progressPercent), "contrato legacy conserva progressPercent");
  assert.ok(Number.isFinite(projection.checkpointCount), "contrato legacy conserva checkpoints");

  const firstDeviation = resolveRouteState({
    distanceFromRoute: 260,
    previousProgress: null,
    timestamp: "2026-08-15T12:00:00.000Z"
  });
  assert.equal(firstDeviation.routeState, ROUTE_STATE.POSSIBLE_DEVIATION, "un punto ambiguo no dispara alarma instantanea");

  const hardDeviation = resolveRouteState({
    distanceFromRoute: 900,
    previousProgress: null,
    timestamp: "2026-08-15T12:00:10.000Z"
  });
  assert.equal(hardDeviation.routeState, ROUTE_STATE.OFF_ROUTE_CONFIRMED, "una separacion obvia conserva alerta inmediata de seguridad");

  const sustained = resolveRouteState({
    distanceFromRoute: 260,
    previousProgress: {
      routeState: ROUTE_STATE.POSSIBLE_DEVIATION,
      deviationStartedAt: "2026-08-15T12:00:00.000Z"
    },
    timestamp: "2026-08-15T12:00:50.000Z"
  });
  assert.equal(sustained.routeState, ROUTE_STATE.OFF_ROUTE_CONFIRMED, "desvio sostenido se confirma");

  const recovery = resolveRouteState({
    distanceFromRoute: 45,
    previousProgress: { routeState: ROUTE_STATE.OFF_ROUTE_CONFIRMED, isOffRoute: true },
    timestamp: "2026-08-15T12:01:00.000Z"
  });
  assert.equal(recovery.routeState, ROUTE_STATE.RECOVERING, "regreso al corredor pasa por recuperacion");

  const stableAgain = resolveRouteState({
    distanceFromRoute: 45,
    previousProgress: { routeState: ROUTE_STATE.RECOVERING, isOffRoute: false },
    timestamp: "2026-08-15T12:01:05.000Z"
  });
  assert.equal(stableAgain.routeState, ROUTE_STATE.ON_ROUTE, "segunda lectura estable cierra recuperacion");

  const vehicle = baseVehicle({
    activeRouteProgress: {
      routeState: ROUTE_STATE.POSSIBLE_DEVIATION,
      deviationStartedAt: "2026-08-15T12:00:00.000Z"
    }
  });
  const confirmed = calculateVehicleRouteProgress({
    coordinates: { latitude: 19.41, longitude: -99.097 },
    heading: 0,
    speed: 8,
    timestamp: "2026-08-15T12:01:00.000Z",
    vehicle
  });
  assert.ok(confirmed, "snapshot calculado");
  assert.equal(confirmed.routeState, ROUTE_STATE.OFF_ROUTE_CONFIRMED, "snapshot usa estado con histéresis");
  assert.equal(confirmed.isOffRoute, true, "solo desvio confirmado alimenta OFF_ROUTE operativo");

  const tolerated = calculateVehicleRouteProgress({
    coordinates: { latitude: 19.41, longitude: -99.0992 },
    heading: 0,
    speed: 8,
    timestamp: "2026-08-15T12:00:01.000Z",
    vehicle: baseVehicle()
  });
  assert.ok(tolerated, "snapshot cercano calculado");
  assert.notEqual(tolerated.routeState, ROUTE_STATE.OFF_ROUTE_CONFIRMED, "calle paralela cercana no se reporta como desvio confirmado");
  assert.equal(tolerated.isOffRoute, false, "sin falsa alerta por una sola lectura cercana");

  console.log("ok - route corridor: tolerancia, histéresis, confirmacion, seguridad y recuperacion");
})();
