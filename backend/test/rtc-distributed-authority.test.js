const assert = require("node:assert/strict");

const { createEmbeddedStore } = require("../src/data/store");
const { createRtcLiveAuthority } = require("../src/modules/rtc/live-authority");
const { createRtcSessionCoordinator } = require("../src/modules/rtc/session-coordinator");
const { createRtcCallService } = require("../src/services/rtc-call-service");
const { createFakeRedis } = require("./helpers/fake-redis");

function serviceHarness(store, redisClient) {
  const emits = [];
  const service = createRtcCallService({
    store,
    redisClient,
    redisReadiness: { enabled: true },
    isClusterReady: () => true,
    emitToUser: (userId, event, payload) => emits.push({ userId, event, payload }),
    deliverNotification: async () => ({ ok: true })
  });
  return { service, emits };
}

(async () => {
  const store = createEmbeddedStore();
  const admin = store.getUserById("user-admin-01");
  const driver = store.getUserById("user-driver-01");
  const supervisor = store.getUserById("user-supervisor-01");
  const supervisorDriver = store.ensureDirectConversation(supervisor.id, driver.id);

  // Two backend instances share one authoritative live-call state.
  {
    const shared = new Map();
    const nodeA = serviceHarness(store, createFakeRedis(shared));
    const nodeB = serviceHarness(store, createFakeRedis(shared));

    const call = await nodeA.service.startCall({
      caller: admin,
      conversationId: "conversation-101",
      mode: "audio"
    });
    assert.equal(call.ok, true);

    const observedFromB = await nodeB.service.getCall(call.callId);
    assert.equal(observedFromB.callId, call.callId);
    assert.equal(observedFromB.status, "ringing");

    const competing = await nodeB.service.startCall({
      caller: supervisor,
      conversationId: supervisorDriver.id,
      mode: "audio"
    });
    assert.equal(competing.ok, false);
    assert.equal(competing.code, "busy", "callee busy is global across backend instances");

    const accepted = await nodeB.service.accept({ user: driver, callId: call.callId });
    assert.equal(accepted.ok, true, "another node can atomically accept the same call");

    const callerJoin = await nodeA.service.canJoinCall({
      callId: call.callId,
      userId: admin.id,
      organizationId: admin.organizationId
    });
    const calleeJoin = await nodeA.service.canJoinCall({
      callId: call.callId,
      userId: driver.id,
      organizationId: driver.organizationId
    });
    assert.equal(callerJoin.ok, true);
    assert.equal(calleeJoin.ok, true);
    assert.equal((await nodeB.service.canJoinCall({
      callId: call.callId,
      userId: supervisor.id,
      organizationId: supervisor.organizationId
    })).reason, "forbidden");

    assert.equal((await nodeA.service.end({ user: admin, callId: call.callId })).ok, true);
    assert.equal(await nodeB.service.getCall(call.callId), null);

    const next = await nodeB.service.startCall({
      caller: supervisor,
      conversationId: supervisorDriver.id,
      mode: "audio"
    });
    assert.equal(next.ok, true, "distributed release frees the busy reservation globally");
    await nodeB.service.cancel({ user: supervisor, callId: next.callId });
  }

  // Compare-and-delete prevents a stale process from releasing a newer state.
  {
    const shared = new Map();
    const authorityA = createRtcLiveAuthority({
      redisClient: createFakeRedis(shared),
      redisReadiness: { enabled: true },
      isClusterReady: () => true
    });
    const authorityB = createRtcLiveAuthority({
      redisClient: createFakeRedis(shared),
      redisReadiness: { enabled: true },
      isClusterReady: () => true
    });
    const ringing = {
      callId: "call-cas-1",
      conversationId: "conversation-101",
      organizationId: admin.organizationId,
      mode: "audio",
      callerId: admin.id,
      calleeIds: [driver.id],
      status: "ringing",
      acceptedBy: null,
      createdAt: Date.now(),
      connectedAt: null,
      endedAt: null
    };

    assert.equal((await authorityA.reserve(ringing)).acquired, true);
    const stale = await authorityB.getCall(ringing.callId);
    const active = { ...stale, status: "active", acceptedBy: driver.id, connectedAt: Date.now() };
    assert.equal(await authorityA.compareAndSet(stale, active), true);
    assert.equal(await authorityB.release(stale), false, "stale state cannot delete current authority");
    assert.equal((await authorityA.getCall(ringing.callId)).status, "active");
    assert.equal(await authorityA.release(active), true);
  }

  // Redis configured but adapter not ready is fail-closed: no local split-brain fallback.
  {
    const service = createRtcCallService({
      store,
      redisClient: createFakeRedis(new Map()),
      redisReadiness: { enabled: true },
      isClusterReady: () => false,
      emitToUser: () => undefined,
      deliverNotification: async () => ({ ok: true })
    });
    const result = await service.startCall({
      caller: admin,
      conversationId: "conversation-101",
      mode: "audio"
    });
    assert.deepEqual(result, { ok: false, code: "rtc_unavailable" });
  }

  // CDR remains store/Mongo authority while Redis only coordinates the active pointer/create lease.
  {
    const cdrStore = createEmbeddedStore();
    const shared = new Map();
    const coordinatorA = createRtcSessionCoordinator({
      store: cdrStore,
      redisClient: createFakeRedis(shared),
      redisReadiness: { enabled: true },
      isClusterReady: () => true
    });
    const coordinatorB = createRtcSessionCoordinator({
      store: cdrStore,
      redisClient: createFakeRedis(shared),
      redisReadiness: { enabled: true },
      isClusterReady: () => true
    });
    const roomId = "call:distributed-cdr-1";
    const payload = {
      organizationId: "manecomb-demo",
      update: {
        participantUserIds: [admin.id, driver.id],
        participantNames: [admin.name, driver.name],
        offerCount: 1,
        sharedScreen: false
      },
      create: {
        roomId,
        organizationId: "manecomb-demo",
        initiatedBy: admin.id,
        participantUserIds: [admin.id, driver.id],
        participantNames: [admin.name, driver.name],
        offerCount: 1,
        mode: "audio",
        sharedScreen: false
      }
    };

    const [first, second] = await Promise.all([
      coordinatorA.ensure(roomId, payload),
      coordinatorB.ensure(roomId, payload)
    ]);
    assert.equal(first.id, second.id, "both nodes converge on one CDR session");
    const active = cdrStore.listRtcSessions({ roomId }).filter((session) => session.status === "active");
    assert.equal(active.length, 1);

    const synced = await coordinatorB.sync(roomId, "manecomb-demo", { usedRelay: true });
    assert.equal(synced.usedRelay, true);
    const finished = await coordinatorA.finish(roomId, "manecomb-demo", {
      status: "completed",
      endReason: "hangup",
      endedAt: new Date().toISOString()
    });
    assert.equal(finished.status, "completed");
    assert.equal(finished.endReason, "hangup");
    assert.equal(shared.has(`manecomb:rtc:cdr:${roomId}`), false, "Redis active CDR pointer is released");
  }

  console.log("ok - RTC distributed live authority and CDR coordination");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
