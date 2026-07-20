const assert = require("assert");

const { createEmbeddedStore } = require("../src/data/store");
const { RtcSessionModel } = require("../src/data/models");
const { SessionRepository } = require("../src/data/repositories/session-repository");

// Fase 1 del CDR: una llamada establecida debe persistir `mode` y `endReason`
// además de la duración real. Se ejercita el store real (no un mock),
// replicando lo que hace la señalización: createRtcSession en el primer
// rtc:offer, y updateRtcSession al cerrar (hangup vs timeout).

async function run() {
  // --- 1. Store embebido: ciclo completo de una videollamada colgada ---
  const store = createEmbeddedStore();

  const created = store.createRtcSession({
    roomId: "room-1",
    organizationId: "org-1",
    initiatedBy: "user-a",
    offerCount: 1,
    mode: "video",
    sharedScreen: false,
    participantUserIds: ["user-a", "user-b"],
    participantNames: ["A", "B"]
  });

  assert.equal(created.mode, "video", "embedded: persiste mode del offer");
  assert.equal(created.endReason, null, "embedded: endReason arranca en null");
  assert.equal(created.status, "active", "embedded: status inicial sin cambios");

  // Cierre iniciado por un participante → endReason 'hangup', con duración real.
  const startedMs = new Date(created.startedAt).getTime();
  const finished = store.updateRtcSession(created.id, {
    status: "completed",
    endReason: "hangup",
    endedAt: new Date(startedMs + 42000).toISOString()
  });

  assert.equal(finished.endReason, "hangup", "embedded: endReason hangup persiste");
  assert.equal(finished.status, "completed", "embedded: status se conserva");
  assert.equal(finished.durationSeconds, 42, "embedded: duración real calculada");
  assert.equal(finished.mode, "video", "embedded: mode se conserva tras update");

  // --- 2. Cierre por timeout (desconexión) se distingue del hangup ---
  const audioCall = store.createRtcSession({
    roomId: "room-2",
    organizationId: "org-1",
    initiatedBy: "user-a",
    offerCount: 1,
    mode: "audio"
  });
  assert.equal(audioCall.mode, "audio", "embedded: mode audio persiste");

  const timedOut = store.updateRtcSession(audioCall.id, {
    status: "completed",
    endReason: "timeout",
    endedAt: new Date().toISOString()
  });
  assert.equal(timedOut.endReason, "timeout", "embedded: timeout distinguible de hangup");

  // --- 3. Retrocompatibilidad: sesión vieja sin los campos nuevos se lee sin error ---
  const legacy = store.createRtcSession({ roomId: "room-3", organizationId: "org-1" });
  delete legacy.mode;
  delete legacy.endReason;
  const relisted = store.listRtcSessions({ roomId: "room-3" });
  assert.equal(relisted.length, 1, "embedded: sesión legacy se lista sin romper");

  // --- 4. Esquema Mongoose: los campos existen con default null ---
  assert.ok(RtcSessionModel.schema.path("mode"), "mongo schema: campo mode declarado");
  assert.ok(RtcSessionModel.schema.path("endReason"), "mongo schema: campo endReason declarado");
  assert.equal(
    RtcSessionModel.schema.path("mode").defaultValue,
    null,
    "mongo schema: mode default null"
  );
  assert.equal(
    RtcSessionModel.schema.path("endReason").defaultValue,
    null,
    "mongo schema: endReason default null"
  );

  // --- 5. Repositorio de Mongo sin modelo cae al store base con los campos ---
  const repo = new SessionRepository(store, {});
  const viaRepo = await repo.createRtcSession({
    roomId: "room-4",
    organizationId: "org-1",
    mode: "video"
  });
  assert.equal(viaRepo.mode, "video", "repo mongo (fallback): propaga mode al store base");
  assert.equal(viaRepo.endReason, null, "repo mongo (fallback): endReason null inicial");

  // --- 6. usedRelay tri-estado (Fase 2) ---
  // Nace en null = desconocido (aun no se reporto getStats).
  const relaySession = store.createRtcSession({
    roomId: "room-5",
    organizationId: "org-1",
    mode: "audio"
  });
  assert.equal(relaySession.usedRelay, null, "usedRelay arranca en null (desconocido)");

  // El cliente reporta que SI paso por TURN.
  const relayed = store.updateRtcSession(relaySession.id, { usedRelay: true });
  assert.strictEqual(relayed.usedRelay, true, "usedRelay=true persiste (paso por relay)");

  // Otra sesion reporta P2P directo.
  const directSession = store.createRtcSession({ roomId: "room-6", organizationId: "org-1" });
  const direct = store.updateRtcSession(directSession.id, { usedRelay: false });
  assert.strictEqual(direct.usedRelay, false, "usedRelay=false persiste (P2P directo)");

  // Sesion que nunca reporta: se distingue de false, queda null.
  const neverReported = store.createRtcSession({ roomId: "room-7", organizationId: "org-1" });
  const closedNoReport = store.updateRtcSession(neverReported.id, {
    status: "completed",
    endReason: "hangup",
    endedAt: new Date().toISOString()
  });
  assert.strictEqual(
    closedNoReport.usedRelay,
    null,
    "sin reporte: usedRelay sigue null, no se confunde con false"
  );

  // Esquema Mongoose declara usedRelay con default null.
  assert.ok(RtcSessionModel.schema.path("usedRelay"), "mongo schema: campo usedRelay declarado");
  assert.equal(
    RtcSessionModel.schema.path("usedRelay").defaultValue,
    null,
    "mongo schema: usedRelay default null"
  );

  // Repo Mongo (fallback) crea con usedRelay null.
  const viaRepoRelay = await repo.createRtcSession({ roomId: "room-8", organizationId: "org-1" });
  assert.strictEqual(viaRepoRelay.usedRelay, null, "repo mongo (fallback): usedRelay null inicial");

  console.log("rtc-session-cdr.test.js: OK");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
