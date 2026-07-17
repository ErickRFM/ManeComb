const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { buildMetrics } = require("../src/services/route-metrics-engine");
const { signToken } = require("../src/utils/jwt");

async function createContext() {
  const store = createEmbeddedStore();
  const route = store.createRoute({
    id: "test-route-12",
    name: "R-12",
    code: "R-12",
    color: "#1473E6",
    origin: { latitude: 19.415, longitude: -99.073 },
    destination: { latitude: 19.4452, longitude: -99.1513 },
    stops: [],
    distanceMeters: 1000,
    durationSeconds: 600,
    durationInTrafficSeconds: 600,
    polyline: [{ latitude: 19.415, longitude: -99.073 }, { latitude: 19.4452, longitude: -99.1513 }],
    organizationId: "manecomb-demo",
    createdBy: "user-admin-01"
  });
  await store.assignRouteToVehicle({
    vehicleId: "vehicle-101",
    routeId: route.id,
    assignment: {
      originLabel: "Pantitlan",
      origin: { latitude: 19.415, longitude: -99.073 },
      destinationLabel: "Tacuba",
      destination: { latitude: 19.4452, longitude: -99.1513 },
      stops: [], assignedBy: "user-admin-01", assignedAt: new Date().toISOString(), provider: "test",
      route: { label: "R-12", distanceMeters: 1000, durationSeconds: 600, durationInTrafficSeconds: 600,
        trafficLevel: "low", polyline: [{ latitude: 19.415, longitude: -99.073 }, { latitude: 19.4452, longitude: -99.1513 }] },
      alternatives: []
    }
  });
  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    routeId: route.id,
    store,
    token: signToken(store.getUserById("user-admin-01")),
    url: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function request(context, path, method = "GET", body) {
  const response = await fetch(`${context.url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${context.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

function testMetricsEngineScenarios() {
  const session = {
    id: "session-metrics-01",
    startedAt: "2026-01-01T08:00:00.000Z",
    finishedAt: "2026-01-01T08:10:00.000Z"
  };
  const positions = [
    { latitude: 19.4, longitude: -99.1, timestamp: "2026-01-01T08:00:00.000Z", speed: 0, accuracy: 8, gpsQuality: "GOOD" },
    { latitude: 19.401, longitude: -99.101, timestamp: "2026-01-01T08:03:00.000Z", speed: 4, accuracy: 25, gpsQuality: "NORMAL" },
    { latitude: 19.402, longitude: -99.102, timestamp: "2026-01-01T08:06:00.000Z", speed: 9, accuracy: 80, gpsQuality: "BAD" }
  ];
  const events = [
    { eventType: "VEHICLE_STOPPED", timestamp: "2026-01-01T08:01:00.000Z" },
    { eventType: "VEHICLE_MOVING", timestamp: "2026-01-01T08:02:00.000Z" },
    { eventType: "VEHICLE_STOPPED", timestamp: "2026-01-01T08:05:00.000Z" },
    { eventType: "VEHICLE_MOVING", timestamp: "2026-01-01T08:07:00.000Z" },
    { eventType: "OFF_ROUTE", timestamp: "2026-01-01T08:03:00.000Z" },
    { eventType: "ON_ROUTE", timestamp: "2026-01-01T08:04:30.000Z" },
    { eventType: "GPS_LOST", timestamp: "2026-01-01T08:08:00.000Z" },
    { eventType: "GPS_RECOVERED", timestamp: "2026-01-01T08:09:00.000Z" },
    { eventType: "SESSION_PAUSED", timestamp: "2026-01-01T08:02:00.000Z" },
    { eventType: "SESSION_RESUMED", timestamp: "2026-01-01T08:04:00.000Z" }
  ];
  const visits = [
    { checkpointId: "checkpoint-1", visitOrder: 1, timestamp: "2026-01-01T08:01:00.000Z" },
    { checkpointId: "checkpoint-2", visitOrder: 2, timestamp: "2026-01-01T08:02:00.000Z" },
    { checkpointId: "checkpoint-1", visitOrder: 3, timestamp: "2026-01-01T08:03:00.000Z" },
    { checkpointId: "checkpoint-2", visitOrder: 4, timestamp: "2026-01-01T08:04:00.000Z" },
    { checkpointId: "checkpoint-1", visitOrder: 5, timestamp: "2026-01-01T08:05:00.000Z" }
  ];

  const metrics = buildMetrics({ events, positions, session, visits });
  assert.equal(metrics.totalDuration, 600);
  assert.equal(metrics.stoppedTime, 180);
  assert.equal(metrics.movingTime, 300);
  assert.equal(metrics.metrics.pausedTime, 120);
  assert.equal(metrics.offRouteTime, 90);
  assert.equal(metrics.gpsLostTime, 60);
  assert.equal(metrics.stopEvents, 2);
  assert.equal(metrics.offRouteEvents, 1);
  assert.equal(metrics.gpsLostEvents, 1);
  assert.equal(metrics.completedLaps, 2);
  assert.equal(metrics.metrics.incompleteLaps, 1);
  assert.equal(metrics.metrics.compliancePercent, 83.33);
  assert.equal(metrics.metrics.gpsQuality.counts.GOOD, 1);
  assert.equal(metrics.metrics.gpsQuality.counts.NORMAL, 1);
  assert.equal(metrics.metrics.gpsQuality.counts.BAD, 1);

  const emptyCheckpointMetrics = buildMetrics({ events: [], positions, session, visits: [] });
  assert.equal(emptyCheckpointMetrics.checkpointCount, 0);
  assert.equal(emptyCheckpointMetrics.completedLaps, 0);
}

function testVehicleRouteFlow(store) {
  const route = store.createRoute({
    id: "route-flow-a",
    name: "Ruta Flujo A",
    code: "RUTA-FLUJO-A",
    color: "#1473E6",
    origin: { latitude: 19.37, longitude: -99.25 },
    destination: { latitude: 19.39, longitude: -99.23 },
    stops: [],
    distanceMeters: 2200,
    durationSeconds: 700,
    durationInTrafficSeconds: 700,
    polyline: [{ latitude: 19.37, longitude: -99.25 }, { latitude: 19.39, longitude: -99.23 }],
    organizationId: "manecomb-demo",
    createdBy: "user-admin-01"
  });

  store.assignRouteToVehicle({
    vehicleId: "vehicle-310",
    routeId: route.id,
    assignedBy: "user-admin-01"
  });

  let vehicle = store.getLiveLocations().vehicles.find((entry) => entry.id === "vehicle-310");
  assert.equal(vehicle.routeId, route.id);
  assert.equal(vehicle.assignedRoute.routeId, route.id);
  assert.equal(vehicle.route.id, route.id);
  assert.equal(vehicle.routeName, "Ruta Flujo A");
  assert.deepEqual(vehicle.route.polyline, route.polyline);

  const updatedRoute = store.updateRoute(route.id, {
    name: "Ruta Flujo Actualizada",
    code: "RUTA-FLUJO-ACTUALIZADA",
    color: "#1473E6",
    origin: { latitude: 19.41, longitude: -99.21 },
    destination: { latitude: 19.43, longitude: -99.19 },
    stops: [],
    distanceMeters: 3300,
    durationSeconds: 900,
    durationInTrafficSeconds: 900,
    polyline: [{ latitude: 19.41, longitude: -99.21 }, { latitude: 19.43, longitude: -99.19 }]
  });

  vehicle = store.getLiveLocations().vehicles.find((entry) => entry.id === "vehicle-310");
  assert.equal(updatedRoute.id, route.id);
  assert.equal(vehicle.routeId, route.id);
  assert.equal(vehicle.assignedRoute.routeId, route.id);
  assert.equal(vehicle.routeName, "Ruta Flujo Actualizada");
  assert.deepEqual(vehicle.route.polyline, updatedRoute.polyline);

  store.deleteRoute(route.id);
  vehicle = store.getLiveLocations().vehicles.find((entry) => entry.id === "vehicle-310");
  assert.equal(vehicle.routeId, null);
  assert.equal(vehicle.assignedRoute, null);
  assert.equal(vehicle.route, null);
  assert.equal(vehicle.routeName, "Sin ruta");
  assert.equal(vehicle.routeCode, "N/A");
}

async function main() {
  testMetricsEngineScenarios();
  const context = await createContext();
  try {
    testVehicleRouteFlow(context.store);
    const [first, second] = await Promise.all([
      request(context, "/navigation/sessions/start", "POST", { vehicleId: "vehicle-101" }),
      request(context, "/navigation/sessions/start", "POST", { vehicleId: "vehicle-101" })
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 201]);
    assert.equal(first.data.data.id, second.data.data.id);
    assert.equal(context.store.listRouteSessions({ vehicleId: "vehicle-101" }).length, 1);

    const session = first.data.data;
    const blockedRoute = await request(context, "/navigation/assign", "POST", {
      vehicleId: "vehicle-101",
      routeId: context.routeId
    });
    assert.equal(blockedRoute.status, 409);
    const blockedDriver = await request(context, "/users/user-driver-01", "PATCH", { vehicleId: null });
    assert.equal(blockedDriver.status, 409);

    const paused = await request(context, `/navigation/sessions/${session.id}/status`, "PATCH", {
      vehicleId: "vehicle-101", status: "PAUSED"
    });
    assert.equal(paused.data.data.status, "PAUSED");
    let persistedPositions = 0;
    const createPosition = context.store.createRouteSessionPosition.bind(context.store);
    context.store.createRouteSessionPosition = (payload) => { persistedPositions += 1; return createPosition(payload); };
    await request(context, "/locations/update", "POST", {
      vehicleId: "vehicle-101", coordinates: { latitude: 19.42, longitude: -99.08 }, accuracy: 8,
      timestamp: new Date().toISOString()
    });
    assert.equal(persistedPositions, 0);
    const resumed = await request(context, `/navigation/sessions/${session.id}/status`, "PATCH", {
      vehicleId: "vehicle-101", status: "RUNNING"
    });
    assert.equal(resumed.data.data.status, "RUNNING");
    const baseTime = new Date(new Date(session.startedAt).getTime() + 1_000);
    await request(context, "/locations/update", "POST", {
      vehicleId: "vehicle-101", coordinates: { latitude: 19.415, longitude: -99.073 }, accuracy: 7,
      speed: 0, sessionId: session.id, packetId: "gps-packet-1",
      timestamp: baseTime.toISOString()
    });
    assert.equal(persistedPositions, 1);
    await request(context, "/locations/update", "POST", {
      vehicleId: "vehicle-101", coordinates: { latitude: 19.415, longitude: -99.073 }, accuracy: 7,
      speed: 0, sessionId: session.id, packetId: "gps-packet-1",
      timestamp: baseTime.toISOString()
    });
    assert.equal(context.store.listRouteSessionPositions({ sessionId: session.id, limit: 10 }).length, 1);
    await request(context, "/locations/update", "POST", {
      vehicleId: "vehicle-101", coordinates: { latitude: 19.4452, longitude: -99.1513 }, accuracy: 9,
      speed: 0,
      timestamp: new Date(baseTime.getTime() + 130_000).toISOString()
    });
    await request(context, "/locations/update", "POST", {
      vehicleId: "vehicle-101", coordinates: { latitude: 19.47, longitude: -99.2 }, accuracy: 80,
      speed: 8,
      timestamp: new Date(baseTime.getTime() + 135_000).toISOString()
    });
    await request(context, "/locations/update", "POST", {
      vehicleId: "vehicle-101", coordinates: { latitude: 19.4452, longitude: -99.1513 }, accuracy: 12,
      speed: 7,
      timestamp: new Date(baseTime.getTime() + 140_000).toISOString()
    });

    const eventsResponse = await request(context, `/navigation/sessions/${session.id}/events`);
    assert.equal(eventsResponse.status, 200);
    const eventTypes = eventsResponse.data.data.map((event) => event.eventType);
    assert.ok(eventTypes.includes("SESSION_STARTED"));
    assert.ok(eventTypes.includes("SESSION_PAUSED"));
    assert.ok(eventTypes.includes("SESSION_RESUMED"));
    assert.ok(eventTypes.includes("GPS_LOST"));
    assert.ok(eventTypes.includes("GPS_RECOVERED"));
    assert.ok(eventTypes.includes("VEHICLE_STOPPED"));
    assert.ok(eventTypes.includes("VEHICLE_MOVING"));
    assert.ok(eventTypes.includes("OFF_ROUTE"));
    assert.ok(eventTypes.includes("ON_ROUTE"));
    assert.ok(eventTypes.includes("CHECKPOINT_REACHED"));
    eventTypes.forEach((eventType, index) => {
      if (index > 0) assert.notEqual(eventType, eventTypes[index - 1]);
    });

    const checkpointResponse = await request(context, `/navigation/sessions/${session.id}/checkpoint-visits`);
    assert.equal(checkpointResponse.status, 200);
    assert.equal(checkpointResponse.data.data.length, 1);
    assert.match(checkpointResponse.data.data[0].checkpointId, /^checkpoint-\d+$/);
    const positions = context.store.listRouteSessionPositions({ sessionId: session.id, limit: 10 });
    assert.ok(positions.some((position) => position.gpsQuality === "BAD"));
    const replayPositions = await request(context, `/navigation/sessions/${session.id}/positions`);
    assert.equal(replayPositions.status, 200);
    assert.equal(replayPositions.data.data.length, 4);
    assert.equal(replayPositions.data.data[0].timestamp, baseTime.toISOString());

    const [finishOne, finishTwo] = await Promise.all([
      request(context, `/navigation/sessions/${session.id}/status`, "PATCH", { vehicleId: "vehicle-101", status: "FINISHED" }),
      request(context, `/navigation/sessions/${session.id}/status`, "PATCH", { vehicleId: "vehicle-101", status: "FINISHED" })
    ]);
    assert.equal(finishOne.status, 200);
    assert.equal(finishTwo.status, 200);
    assert.equal(finishOne.data.data.id, finishTwo.data.data.id);
    assert.equal(context.store.getActiveRouteSession("vehicle-101"), null);
    assert.equal(context.store.listRouteSessions({ vehicleId: "vehicle-101" }).length, 1);
    const finishedEvents = await request(context, `/navigation/sessions/${session.id}/events?type=SESSION_FINISHED`);
    assert.equal(finishedEvents.data.data.length, 1);
    const latePacket = {
      vehicleId: "vehicle-101",
      sessionId: "pending:vehicle-101",
      packetId: "late-gps-packet-01",
      coordinates: { latitude: 19.416, longitude: -99.074 },
      accuracy: 10,
      speed: 2,
      timestamp: session.startedAt
    };
    assert.equal((await request(context, "/locations/update", "POST", latePacket)).status, 200);
    assert.equal((await request(context, "/locations/update", "POST", latePacket)).status, 200);
    assert.equal(context.store.listRouteSessionPositions({ sessionId: session.id, limit: 20 }).length, 5);
    const recoveryTimestamp = new Date(baseTime.getTime() + 150_000).toISOString();
    context.store.createRouteSessionPosition({
      organizationId: "manecomb-demo",
      sessionId: "recovery-session-204",
      vehicleId: "vehicle-204",
      latitude: 19.5,
      longitude: -99.25,
      timestamp: recoveryTimestamp,
      heading: 90,
      speed: 4,
      accuracy: 10,
      gpsQuality: "GOOD"
    });
    const recoveredVehicle = context.store.getLiveLocations().vehicles.find((entry) => entry.id === "vehicle-204");
    assert.equal(recoveredVehicle.locationTimestamp, recoveryTimestamp);
    assert.deepEqual(recoveredVehicle.location, { latitude: 19.5, longitude: -99.25 });

    const persistedSession = context.store.getRouteSessionById(session.id);
    assert.equal(persistedSession.statisticsReady, true);
    assert.equal(persistedSession.processingStatus, "COMPLETED");
    assert.ok(persistedSession.processingCompletedAt);
    assert.ok(persistedSession.totalDistance > 0);
    assert.ok(persistedSession.totalDuration >= 0);
    assert.equal(persistedSession.gpsLostEvents, 1);
    assert.equal(persistedSession.offRouteEvents, 1);
    assert.equal(persistedSession.completedCheckpoints, 1);
    assert.equal(persistedSession.metrics.positionCount, 5);
    assert.equal(persistedSession.metrics.gpsQuality.counts.BAD, 1);

    const metricsResponse = await request(context, `/navigation/sessions/${session.id}/metrics`);
    assert.equal(metricsResponse.status, 200);
    assert.equal(metricsResponse.data.data.statisticsReady, true);
    assert.equal(metricsResponse.data.data.processingStatus, "COMPLETED");
    assert.equal(metricsResponse.data.data.sessionId, session.id);
    assert.equal(metricsResponse.data.data.metrics.positionCount, 5);

    const historyResponse = await request(context, "/navigation/sessions/history?vehicleId=vehicle-101&status=FINISHED");
    assert.equal(historyResponse.status, 200);
    assert.equal(historyResponse.data.data.length, 1);
    assert.equal(historyResponse.data.data[0].id, session.id);

    const recalculatedResponse = await request(context, `/navigation/sessions/${session.id}/recalculate`, "POST");
    assert.equal(recalculatedResponse.status, 200);
    assert.equal(recalculatedResponse.data.data.id, session.id);
    assert.equal(recalculatedResponse.data.data.statisticsReady, true);
    assert.equal(recalculatedResponse.data.data.processingStatus, "COMPLETED");
    assert.equal(context.store.listRouteSessions({ vehicleId: "vehicle-101" }).length, 1);
    console.log("ok - jornadas protegen doble inicio/final, transiciones, eventos y metricas persistidas");
  } finally { await context.close(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
