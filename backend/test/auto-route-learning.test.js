process.env.AUTO_ROUTE_LEARNING_ENABLED = "true";
process.env.AUTO_ROUTE_REVIEW_ENABLED = "true";
process.env.AUTO_ROUTE_ALGORITHM_VERSION = "v2";

const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { compareCorridors, processCompletedRouteSession } = require("../src/services/auto-route-learning");
const { signToken } = require("../src/utils/jwt");

const MAIN_PATH = Array.from({ length: 16 }, (_, index) => ({
  latitude: 19.4 + index * 0.0008,
  longitude: -99.14 + index * 0.0001
}));
const ALTERNATE_PATH = MAIN_PATH.map((point, index) => ({
  latitude: point.latitude,
  longitude: point.longitude + Math.sin(Math.PI * index / (MAIN_PATH.length - 1)) * 0.0022
}));

function noisyPath(seed) {
  return MAIN_PATH.map((point, index) => {
    const sign = (index + seed) % 2 === 0 ? 1 : -1;
    return { latitude: point.latitude + sign * 0.000035, longitude: point.longitude - sign * 0.000025 };
  });
}

async function createEvidenceSession(store, {
  index, organizationId = "manecomb-demo", vehicleId = "vehicle-101", path = MAIN_PATH,
  accuracy = 12, intervalMs = 30000, gapAfter = null,
  // `dayIndex`/`hour` permiten sintetizar varias vueltas DENTRO del mismo dia
  // operativo. Por omision cada evidencia cae en un dia distinto, como antes.
  dayIndex = index, hour = 12
}) {
  const start = new Date(Date.UTC(2026, 6, 1 + dayIndex, hour, 0, 0));
  // Auto-route learning tests synthesize historical vehicle evidence. They do
  // not model a live authenticated driver's journey, so they must not invent a
  // driverId that violates the canonical route-session lifecycle guard.
  const created = await store.createRouteSession({
    organizationId, routeId: `recording:${vehicleId}`, vehicleId,
    startedAt: start.toISOString()
  });
  for (let pointIndex = 0; pointIndex < path.length; pointIndex += 1) {
    const gapMs = gapAfter !== null && pointIndex > gapAfter ? 600000 : 0;
    await store.createRouteSessionPosition({
      organizationId, sessionId: created.id, vehicleId, packetId: `${created.id}:${pointIndex}`,
      latitude: path[pointIndex].latitude, longitude: path[pointIndex].longitude, accuracy,
      timestamp: new Date(start.getTime() + pointIndex * intervalMs + gapMs).toISOString()
    });
  }
  await store.updateRouteSession(created.id, {
    expectedStatus: "RUNNING", status: "FINISHED",
    finishedAt: new Date(start.getTime() + path.length * intervalMs + (gapAfter === null ? 0 : 600000)).toISOString()
  });
  return created.id;
}

async function processSeries(store, optionsList) {
  const results = [];
  for (const options of optionsList) {
    const sessionId = await createEvidenceSession(store, options);
    results.push({ sessionId, result: await processCompletedRouteSession(store, sessionId) });
  }
  return results;
}

async function request(context, path, method = "GET", body) {
  const response = await fetch(`${context.url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${context.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

async function createHttpContext(store) {
  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/api`,
    token: signToken(store.getUserById("user-admin-01")),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

// --- Uso habitual: tres vueltas del mismo turno NO son un patron -----------
// Antes bastaba `evidenceCount >= minEvidenceCount`, asi que un solo dia de
// operacion cerraba la evidencia y ManeComb proponia como ruta oficial lo que
// podia ser un desvio puntual.
async function testSameDayEvidenceStaysCollecting() {
  const store = createEmbeddedStore();
  await processSeries(store, [
    { index: 1, dayIndex: 5, hour: 6 },
    { index: 2, dayIndex: 5, hour: 10, path: noisyPath(2) },
    { index: 3, dayIndex: 5, hour: 16, path: noisyPath(3) }
  ]);

  let candidates = await store.listLearnedRouteCandidates({ organizationId: "manecomb-demo" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].evidenceCount, 3, "las tres vueltas si son evidencia");
  assert.equal(candidates[0].distinctServiceDays, 1, "pero pertenecen a un solo dia operativo");
  assert.equal(
    candidates[0].status,
    "COLLECTING",
    "tres vueltas el mismo dia no demuestran un recorrido habitual"
  );
  assert.ok(candidates[0].confidence < 1, "la confianza no puede afirmar evidencia completa");

  // Una cuarta vuelta en OTRO dia completa el patron.
  await processSeries(store, [{ index: 4, dayIndex: 6, hour: 7, path: noisyPath(4) }]);
  candidates = await store.listLearnedRouteCandidates({ organizationId: "manecomb-demo" });
  assert.equal(candidates[0].distinctServiceDays, 2);
  assert.equal(candidates[0].status, "READY_FOR_REVIEW", "dos dias distintos si cierran la evidencia");
  assert.equal(candidates[0].confidence, 1);
  assert.ok(candidates[0].firstSeenAt, "la evidencia registra cuando se vio por primera vez");
  assert.ok(candidates[0].lastSeenAt, "y cuando se vio por ultima vez");
  assert.ok(
    new Date(candidates[0].firstSeenAt).getTime() < new Date(candidates[0].lastSeenAt).getTime(),
    "el rango observado debe abarcar varios dias"
  );

  console.log("ok - la evidencia exige recorridos repetidos en dias operativos distintos");
}

async function main() {
  await testSameDayEvidenceStaysCollecting();
  const store = createEmbeddedStore();
  const first = await processSeries(store, [{ index: 1 }]);
  assert.equal(first[0].result.eligible, true);
  let candidates = await store.listLearnedRouteCandidates({ organizationId: "manecomb-demo" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, "COLLECTING");
  assert.equal(candidates[0].evidenceCount, 1);

  await processSeries(store, [{ index: 2, path: noisyPath(2) }, { index: 3, path: noisyPath(3) }]);
  candidates = await store.listLearnedRouteCandidates({ organizationId: "manecomb-demo" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, "READY_FOR_REVIEW");
  assert.equal(candidates[0].evidenceCount, 3);
  assert.equal(candidates[0].representativeSessionId, first[0].sessionId);
  assert.deepEqual(candidates[0].polyline, first[0].result.candidate.polyline);

  assert.equal((await processCompletedRouteSession(store, first[0].sessionId)).reason, "already_processed");
  assert.equal((await store.listLearnedRouteCandidates({ organizationId: "manecomb-demo" }))[0].evidenceCount, 3);

  await processSeries(store, [
    { index: 4, path: ALTERNATE_PATH }, { index: 5, path: ALTERNATE_PATH }, { index: 6, path: ALTERNATE_PATH }
  ]);
  candidates = await store.listLearnedRouteCandidates({ organizationId: "manecomb-demo" });
  assert.equal(candidates.length, 2);
  assert.equal(candidates.filter((candidate) => candidate.status === "READY_FOR_REVIEW").length, 2);
  assert.equal(compareCorridors(MAIN_PATH, ALTERNATE_PATH).matches, false);

  const reversePath = [...MAIN_PATH].reverse();
  await processSeries(store, [
    { index: 7, path: reversePath }, { index: 8, path: reversePath }, { index: 9, path: reversePath }
  ]);
  candidates = await store.listLearnedRouteCandidates({ organizationId: "manecomb-demo" });
  assert.equal(candidates.length, 3);
  assert.equal(new Set(candidates.map((candidate) => candidate.direction)).size, 2);

  const multiVehicleStore = createEmbeddedStore();
  await processSeries(multiVehicleStore, [
    { index: 10, vehicleId: "vehicle-101" },
    { index: 11, vehicleId: "vehicle-102", path: noisyPath(1) },
    { index: 12, vehicleId: "vehicle-101", path: noisyPath(2) }
  ]);
  const sharedCandidate = (await multiVehicleStore.listLearnedRouteCandidates({ organizationId: "manecomb-demo" }))[0];
  assert.equal(sharedCandidate.evidenceCount, 3);
  assert.equal(sharedCandidate.vehicleCount, 2);
  assert.deepEqual(new Set(sharedCandidate.evidenceVehicleIds), new Set(["vehicle-101", "vehicle-102"]));

  await processSeries(multiVehicleStore, [
    { index: 13, organizationId: "tenant-b", vehicleId: "vehicle-101" },
    { index: 14, organizationId: "tenant-b", vehicleId: "vehicle-102", path: noisyPath(1) },
    { index: 15, organizationId: "tenant-b", vehicleId: "vehicle-103", path: noisyPath(2) }
  ]);
  assert.equal((await multiVehicleStore.listLearnedRouteCandidates({ organizationId: "manecomb-demo" })).length, 1);
  assert.equal((await multiVehicleStore.listLearnedRouteCandidates({ organizationId: "tenant-b" })).length, 1);

  const concurrentStore = createEmbeddedStore();
  const concurrentSessions = await Promise.all([0, 1, 2].map((offset) => createEvidenceSession(concurrentStore, {
    index: 16 + offset, vehicleId: `vehicle-${101 + offset}`, path: noisyPath(0)
  })));
  await Promise.all(concurrentSessions.map((sessionId) => processCompletedRouteSession(concurrentStore, sessionId)));
  const concurrentCandidates = await concurrentStore.listLearnedRouteCandidates({ organizationId: "manecomb-demo" });
  assert.equal(concurrentCandidates.length, 1);
  assert.equal(concurrentCandidates[0].evidenceCount, 3);

  const excessiveDetour = MAIN_PATH.map((point, index) => ({
    latitude: point.latitude,
    longitude: point.longitude + (index === 0 || index === MAIN_PATH.length - 1 ? 0 : (index % 2 ? 0.004 : -0.004))
  }));
  assert.equal(compareCorridors(MAIN_PATH, excessiveDetour).matches, false);
  assert.ok(compareCorridors(MAIN_PATH, excessiveDetour).lengthDifferenceRatio > 0.30);

  const invalidStore = createEmbeddedStore();
  const gapSession = await createEvidenceSession(invalidStore, { index: 19, gapAfter: 4 });
  assert.equal((await processCompletedRouteSession(invalidStore, gapSession)).reason, "insufficient_points");
  const impossiblePath = MAIN_PATH.map((point, index) => ({ latitude: point.latitude + index * 0.01, longitude: point.longitude }));
  const speedSession = await createEvidenceSession(invalidStore, { index: 20, path: impossiblePath, intervalMs: 1000 });
  assert.equal((await processCompletedRouteSession(invalidStore, speedSession)).reason, "insufficient_points");

  const rejected = await multiVehicleStore.updateLearnedRouteCandidate(sharedCandidate.id, { status: "REJECTED" });
  assert.equal(rejected.status, "REJECTED");
  await processSeries(multiVehicleStore, [{ index: 21 }, { index: 22 }, { index: 23 }]);
  const afterRejected = await multiVehicleStore.listLearnedRouteCandidates({ organizationId: "manecomb-demo" });
  assert.equal(afterRejected.filter((candidate) => candidate.status === "READY_FOR_REVIEW").length, 0);
  await processSeries(multiVehicleStore, [{ index: 24, path: ALTERNATE_PATH }]);
  assert.equal((await multiVehicleStore.listLearnedRouteCandidates({ organizationId: "manecomb-demo" })).length, 2);

  const approvalStore = createEmbeddedStore();
  await processSeries(approvalStore, [{ index: 25 }, { index: 26 }, { index: 27 }]);
  const approvalCandidate = (await approvalStore.listLearnedRouteCandidates({ organizationId: "manecomb-demo" }))[0];
  const vehicleBefore = approvalStore.getVehicleById("vehicle-101");
  const context = await createHttpContext(approvalStore);
  try {
    const approval = await request(context, `/navigation/learned-routes/${approvalCandidate.id}/approve`, "POST", {
      name: "Ruta aprendida validada"
    });
    assert.equal(approval.status, 201);
    assert.ok(approval.data.route.id);
    assert.equal(approval.data.data.approvedRouteId, approval.data.route.id);
    assert.deepEqual(approvalStore.getVehicleById("vehicle-101").assignedRoute, vehicleBefore.assignedRoute);
  } finally {
    await context.close();
  }

  console.log("auto route learning corridor tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
