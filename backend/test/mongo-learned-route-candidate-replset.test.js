const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const TEST_DB = "learned_route_candidate_replset_validation";
const ORG = "LEARNED-ROUTE-REPLSET-ORG";

function evidence({ sessionId, serviceDate, observedAt, distanceMeters, durationSeconds }) {
  return {
    organizationId: ORG,
    groupKey: "corridor:northbound:v1",
    corridorCluster: "corridor:northbound",
    vehicleId: "vehicle-1",
    direction: "OUTBOUND",
    algorithmVersion: "test-v1",
    geometryVersion: "test-v1",
    representativeSessionId: sessionId,
    origin: { latitude: 19.415, longitude: -99.073 },
    destination: { latitude: 19.4452, longitude: -99.1513 },
    polyline: [
      { latitude: 19.415, longitude: -99.073 },
      { latitude: 19.4452, longitude: -99.1513 }
    ],
    sessionId,
    serviceDate,
    observedAt,
    distanceMeters,
    durationSeconds,
    confidence: 0.9,
    minimumEvidenceCount: 3,
    minimumDistinctServiceDays: 2
  };
}

(async () => {
  const { MongoMemoryReplSet } = require("mongodb-memory-server");
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  let cleanupOk = false;

  try {
    await mongoose.connect(uri, { dbName: TEST_DB });
    const { LearnedRouteCandidateModel } = require("../src/data/models");
    await LearnedRouteCandidateModel.syncIndexes();
    const { createMongoStore } = require("../src/data/mongo-store");
    const store = await createMongoStore();

    const firstAt = "2026-08-14T14:00:00.000Z";
    const secondAt = "2026-08-14T15:00:00.000Z";
    const thirdAt = "2026-08-14T16:00:00.000Z";
    const fourthAt = "2026-08-15T14:00:00.000Z";

    let candidate = await store.upsertLearnedRouteCandidate(evidence({
      sessionId: "session-1", serviceDate: "2026-08-14", observedAt: firstAt,
      distanceMeters: 1000, durationSeconds: 600
    }));
    assert.equal(candidate.evidenceCount, 1);
    assert.equal(candidate.distinctServiceDays, 1);
    assert.equal(new Date(candidate.firstSeenAt).toISOString(), firstAt);
    assert.equal(new Date(candidate.lastSeenAt).toISOString(), firstAt);
    assert.equal(candidate.status, "COLLECTING");

    candidate = await store.upsertLearnedRouteCandidate(evidence({
      sessionId: "session-2", serviceDate: "2026-08-14", observedAt: secondAt,
      distanceMeters: 1100, durationSeconds: 660
    }));
    candidate = await store.upsertLearnedRouteCandidate(evidence({
      sessionId: "session-3", serviceDate: "2026-08-14", observedAt: thirdAt,
      distanceMeters: 1200, durationSeconds: 720
    }));
    assert.deepEqual(candidate.evidenceServiceDates, ["2026-08-14"]);
    assert.equal(candidate.distinctServiceDays, 1);
    assert.equal(candidate.evidenceCount, 3);
    assert.equal(candidate.status, "COLLECTING");
    assert.equal(new Date(candidate.firstSeenAt).toISOString(), firstAt);
    assert.equal(new Date(candidate.lastSeenAt).toISOString(), thirdAt);

    candidate = await store.upsertLearnedRouteCandidate(evidence({
      sessionId: "session-4", serviceDate: "2026-08-15", observedAt: fourthAt,
      distanceMeters: 1300, durationSeconds: 780
    }));
    assert.equal(candidate.evidenceCount, 4);
    assert.equal(candidate.distinctServiceDays, 2);
    assert.deepEqual(candidate.evidenceServiceDates.sort(), ["2026-08-14", "2026-08-15"]);
    assert.equal(candidate.status, "READY_FOR_REVIEW");

    const beforeDuplicate = {
      evidenceCount: candidate.evidenceCount,
      distinctServiceDays: candidate.distinctServiceDays,
      distanceMeters: candidate.distanceMeters,
      durationSeconds: candidate.durationSeconds,
      confidence: candidate.confidence,
      firstSeenAt: new Date(candidate.firstSeenAt).toISOString(),
      lastSeenAt: new Date(candidate.lastSeenAt).toISOString()
    };
    candidate = await store.upsertLearnedRouteCandidate(evidence({
      sessionId: "session-4", serviceDate: "2026-08-16", observedAt: "2026-08-16T18:00:00.000Z",
      distanceMeters: 99999, durationSeconds: 99999
    }));
    assert.deepEqual({
      evidenceCount: candidate.evidenceCount,
      distinctServiceDays: candidate.distinctServiceDays,
      distanceMeters: candidate.distanceMeters,
      durationSeconds: candidate.durationSeconds,
      confidence: candidate.confidence,
      firstSeenAt: new Date(candidate.firstSeenAt).toISOString(),
      lastSeenAt: new Date(candidate.lastSeenAt).toISOString()
    }, beforeDuplicate);
    assert.equal(candidate.evidenceSessionIds.filter((id) => id === "session-4").length, 1);

    console.log("MONGO_LEARNED_ROUTE_PRODUCTION_PATH=PASSED");
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      cleanupOk = true;
    }
    await mongoose.disconnect().catch(() => undefined);
    await replSet.stop().catch(() => undefined);
    console.log(`CLEANUP dropDatabase=${cleanupOk} replicaSetStopped=true`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
