/**
 * Certifica el vertical GPS -> sesion -> RouteSessionPosition -> historial para
 * una jornada SIN ruta oficial (identidad tecnica `recording:{vehicleId}`), y la
 * reconciliacion de una jornada iniciada sin Internet.
 *
 * Causa raiz que fija este archivo: al reconciliar la cola offline el servidor
 * sellaba `startedAt` con la hora de reconexion. Todos los puntos capturados
 * durante el corte quedaban por debajo del inicio de la sesion y el backend los
 * descartaba en silencio, asi que el recorrido se veia en el mapa pero no dejaba
 * historial. Ademas los puntos encolados siguen viajando con el id local
 * `pending:{vehicleId}`, que no existe en el servidor.
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");
const { resolveSessionStartedAt, MAX_CLIENT_QUEUE_AGE_MS } = require("../src/services/tracking-time");
const { ingestVehicleLocation } = require("../src/services/vehicle-location-ingestion");
const { buildOperationalUnitSnapshot } = require("../src/domain/operational-unit-snapshot");

const VEHICLE_ID = "vehicle-101";

function fakeIo() {
  const channel = { emit() { return channel; }, to() { return channel; } };
  return channel;
}

async function createContext() {
  const store = createEmbeddedStore();
  // Jornada libre: la unidad NO tiene ruta oficial asignada.
  await store.updateVehicle(VEHICLE_ID, { routeId: null, assignedRoute: null });
  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    store,
    driverToken: signToken(store.getUserById("user-driver-01")),
    url: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function post(context, path, body) {
  const response = await fetch(`${context.url}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${context.driverToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

function positionsOf(store, sessionId) {
  return store.listRouteSessionPositions({ sessionId, limit: 5000 });
}

// --- Politica de inicio retroactivo ------------------------------------------
function testStartedAtPolicy() {
  const now = new Date("2026-08-14T12:00:00.000Z");

  assert.equal(
    resolveSessionStartedAt(null, now),
    now.toISOString(),
    "sin declaracion del cliente manda el reloj del servidor"
  );

  const offlineStart = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  assert.equal(
    resolveSessionStartedAt(offlineStart, now),
    offlineStart,
    "una jornada iniciada sin Internet conserva su inicio real"
  );

  const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  assert.equal(
    resolveSessionStartedAt(future, now),
    now.toISOString(),
    "un reloj adelantado no puede abrir una jornada que aun no ocurre"
  );

  const tooOld = new Date(now.getTime() - MAX_CLIENT_QUEUE_AGE_MS - 60_000).toISOString();
  assert.equal(
    resolveSessionStartedAt(tooOld, now),
    new Date(now.getTime() - MAX_CLIENT_QUEUE_AGE_MS).toISOString(),
    "no se acepta evidencia mas antigua que la ventana de la cola offline"
  );

  assert.equal(resolveSessionStartedAt("no-es-fecha", now), now.toISOString());

  console.log("ok - politica de inicio retroactivo acotada al pasado y a la ventana de cola");
}

// --- Jornada libre: identidad tecnica y persistencia de puntos ---------------
async function testFreeRouteRecordingPersistsHistory() {
  const context = await createContext();
  try {
    const started = await post(context, "/navigation/sessions/start", { vehicleId: VEHICLE_ID });
    assert.equal(started.status, 201);
    const session = started.data.data;
    assert.equal(session.status, "RUNNING");
    assert.equal(
      session.routeId,
      `recording:${VEHICLE_ID}`,
      "una jornada sin ruta oficial usa la identidad tecnica de grabacion"
    );

    // La identidad tecnica jamas se presenta como ruta oficial.
    const vehicle = await context.store.getVehicleById(VEHICLE_ID);
    const snapshot = buildOperationalUnitSnapshot({ vehicle, activeSession: session });
    assert.equal(snapshot.route, null, "recording:* no puede aparecer como ruta asignada");

    const actor = context.store.getUserById("user-driver-01");
    const baseMs = new Date(session.startedAt).getTime() + 1000;
    for (let index = 0; index < 6; index += 1) {
      const result = await ingestVehicleLocation({
        actor,
        io: fakeIo(),
        store: context.store,
        transport: "http",
        payload: {
          vehicleId: VEHICLE_ID,
          coordinates: { latitude: 19.415 + index * 0.001, longitude: -99.073 + index * 0.001 },
          timestamp: new Date(baseMs + index * 5000).toISOString(),
          accuracy: 6,
          packetId: `recording-packet-${index}`,
          sessionId: session.id
        }
      });
      assert.equal(result.accepted, true, `el paquete ${index} debe aceptarse`);
    }

    const persisted = positionsOf(context.store, session.id);
    assert.equal(persisted.length, 6, "una jornada sin ruta guarda historial igual que una con ruta");

    console.log("ok - jornada libre graba historial bajo la identidad recording:*");
  } finally {
    await context.close();
  }
}

// --- Caso I: jornada iniciada sin Internet y reconciliada --------------------
async function testOfflineJourneyKeepsHistoryAfterReconciliation() {
  const context = await createContext();
  try {
    // El conductor inicia la jornada sin Internet a T0 y conduce 10 minutos.
    // La app encola el inicio y los puntos; al reconectar replica en orden.
    const reconnectedAt = new Date();
    const offlineStartedAt = new Date(reconnectedAt.getTime() - 10 * 60 * 1000);

    const started = await post(context, "/navigation/sessions/start", {
      vehicleId: VEHICLE_ID,
      startedAt: offlineStartedAt.toISOString()
    });
    assert.equal(started.status, 201);
    const session = started.data.data;
    assert.equal(
      new Date(session.startedAt).getTime(),
      offlineStartedAt.getTime(),
      "la jornada reconciliada conserva su inicio real, no la hora de reconexion"
    );

    const actor = context.store.getUserById("user-driver-01");
    // Los puntos encolados viajan con el id LOCAL `pending:{vehicleId}` y con
    // timestamps de captura reconstruidos por la edad de cola.
    let accepted = 0;
    for (let index = 0; index < 8; index += 1) {
      const capturedAt = new Date(offlineStartedAt.getTime() + (index + 1) * 60 * 1000);
      const result = await ingestVehicleLocation({
        actor,
        io: fakeIo(),
        store: context.store,
        transport: "http",
        payload: {
          vehicleId: VEHICLE_ID,
          coordinates: { latitude: 19.415 + index * 0.002, longitude: -99.073 + index * 0.002 },
          timestamp: capturedAt.toISOString(),
          clientQueueAgeMs: reconnectedAt.getTime() - capturedAt.getTime(),
          accuracy: 7,
          packetId: `offline-packet-${index}`,
          sessionId: `pending:${VEHICLE_ID}`
        }
      });
      if (result.accepted) accepted += 1;
    }

    assert.equal(accepted, 8, "los paquetes de la cola offline deben aceptarse");
    const persisted = positionsOf(context.store, session.id);
    assert.equal(
      persisted.length,
      8,
      "el recorrido capturado sin Internet debe quedar en el historial tras reconciliar"
    );

    // El backlog no rejuvenece: las posiciones conservan su instante de captura.
    const timestamps = persisted.map((position) => new Date(position.timestamp).getTime()).sort((a, b) => a - b);
    assert.ok(
      timestamps[0] < reconnectedAt.getTime() - 8 * 60 * 1000,
      "el primer punto conserva su captura original, no la hora de reconexion"
    );
    assert.ok(
      timestamps[timestamps.length - 1] <= reconnectedAt.getTime(),
      "ningun punto de la cola puede quedar en el futuro"
    );

    console.log("ok - jornada offline reconciliada conserva todo su historial");
  } finally {
    await context.close();
  }
}

// --- Idempotencia: un replay repetido no duplica evidencia -------------------
async function testQueueReplayIsIdempotent() {
  const context = await createContext();
  try {
    const started = await post(context, "/navigation/sessions/start", { vehicleId: VEHICLE_ID });
    const session = started.data.data;
    const actor = context.store.getUserById("user-driver-01");
    const capturedAt = new Date(new Date(session.startedAt).getTime() + 30_000);
    const payload = {
      vehicleId: VEHICLE_ID,
      coordinates: { latitude: 19.42, longitude: -99.08 },
      timestamp: capturedAt.toISOString(),
      accuracy: 5,
      packetId: "replayed-packet",
      sessionId: `pending:${VEHICLE_ID}`
    };

    await ingestVehicleLocation({ actor, io: fakeIo(), store: context.store, transport: "http", payload });
    const afterFirst = positionsOf(context.store, session.id).length;
    await ingestVehicleLocation({ actor, io: fakeIo(), store: context.store, transport: "http", payload });
    const afterSecond = positionsOf(context.store, session.id).length;

    assert.equal(afterFirst, 1);
    assert.equal(afterSecond, 1, "un packetId repetido no puede duplicar evidencia historica");

    console.log("ok - el replay de la cola es idempotente por packetId");
  } finally {
    await context.close();
  }
}

async function patch(context, path, body) {
  const response = await fetch(`${context.url}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${context.driverToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

// --- Backlog historico no pertenece a una jornada activa posterior ----------
async function testHistoricalPendingPacketPrefersFinishedSession() {
  const context = await createContext();
  try {
    const now = Date.now();
    const s1StartedAt = new Date(now - 60 * 60 * 1000).toISOString();
    const s1FinishedAt = new Date(now - 30 * 60 * 1000).toISOString();
    const capturedAt = new Date(now - 45 * 60 * 1000).toISOString();
    const s2StartedAt = new Date(now - 15 * 60 * 1000).toISOString();

    const s1Response = await post(context, "/navigation/sessions/start", {
      vehicleId: VEHICLE_ID,
      startedAt: s1StartedAt
    });
    assert.equal(s1Response.status, 201);
    const s1 = s1Response.data.data;
    const finishResponse = await patch(context, `/navigation/sessions/${s1.id}/status`, {
      vehicleId: VEHICLE_ID,
      status: "FINISHED",
      finishedAt: s1FinishedAt
    });
    assert.equal(finishResponse.status, 200);
    await context.store.updateRouteSession(s1.id, { finishedAt: s1FinishedAt });
    const s2Response = await post(context, "/navigation/sessions/start", {
      vehicleId: VEHICLE_ID,
      startedAt: s2StartedAt
    });
    assert.equal(s2Response.status, 201);
    const s2 = s2Response.data.data;
    assert.notEqual(s2.id, s1.id, "S2 debe ser una jornada activa distinta de S1");
    const historical = context.store.listRouteSessions({ vehicleId: VEHICLE_ID, limit: 50 })
      .find((session) => new Date(capturedAt).getTime() >= new Date(session.startedAt).getTime()
        && (!session.finishedAt || new Date(capturedAt).getTime() <= new Date(session.finishedAt).getTime()));
    assert.equal(historical?.id, s1.id, "la evidencia temporal identifica S1 antes de ingerir");

    const actor = context.store.getUserById("user-driver-01");
    const payload = {
      vehicleId: VEHICLE_ID,
      coordinates: { latitude: 19.421, longitude: -99.081 },
      timestamp: capturedAt,
      clientQueueAgeMs: now - new Date(capturedAt).getTime(),
      accuracy: 6,
      packetId: "historical-pending-packet",
      sessionId: `pending:${VEHICLE_ID}`
    };
    await ingestVehicleLocation({ actor, io: fakeIo(), store: context.store, transport: "http", payload });
    await ingestVehicleLocation({ actor, io: fakeIo(), store: context.store, transport: "http", payload });

    const s1Matches = positionsOf(context.store, s1.id)
      .filter((position) => position.packetId === payload.packetId);
    const s2Matches = positionsOf(context.store, s2.id)
      .filter((position) => position.packetId === payload.packetId);
    assert.equal(s1Matches.length, 1, "el paquete historico se persiste una sola vez en S1");
    assert.equal(s2Matches.length, 0, "el paquete historico no se atribuye a S2 activa");
    assert.equal(s1Matches[0].packetId, payload.packetId, "packetId se conserva e identifica el replay");
    assert.ok(Math.abs(new Date(s1Matches[0].timestamp).getTime() - new Date(capturedAt).getTime()) < 1_000,
      "capturedAt se conserva con la precision de recepcion, sin rejuvenecer a las 11:00");

    console.log("ok - pending historico prefiere la sesion finalizada que contiene capturedAt");
  } finally {
    await context.close();
  }
}

async function main() {
  testStartedAtPolicy();
  await testFreeRouteRecordingPersistsHistory();
  await testOfflineJourneyKeepsHistoryAfterReconciliation();
  await testQueueReplayIsIdempotent();
  await testHistoricalPendingPacketPrefersFinishedSession();
  console.log("ok - historial de recorrido certificado con y sin Internet");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
