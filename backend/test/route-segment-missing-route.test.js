const assert = require("node:assert/strict");

process.env.AUTO_ROUTE_LEARNING_ENABLED = "true";
process.env.AUTO_ROUTE_SEGMENT_LEARNING_ENABLED = "true";
process.env.AUTO_ROUTE_SEGMENT_ALGORITHM_VERSION = "v3-segment";

const { processCompletedRouteSession } = require("../src/services/auto-route-learning");

(async () => {
  const completed = [];
  const store = {
    async getRouteSessionById() {
      return {
        id: "session-missing-route",
        organizationId: "org-v3",
        routeId: "route-deleted",
        vehicleId: "vehicle-v3",
        driverId: "driver-v3",
        status: "FINISHED"
      };
    },
    async getRouteById() {
      return null;
    },
    async claimAutoRouteProcessing(payload) {
      return { claimed: true, id: `${payload.sessionId}:${payload.algorithmVersion}` };
    },
    async completeAutoRouteProcessing(id, payload) {
      completed.push({ id, payload });
      return payload;
    }
  };

  const result = await processCompletedRouteSession(store, "session-missing-route");
  assert.equal(result.processed, true, "la sesion queda procesada y cerrada");
  assert.equal(result.segmentLearning, true, "permanece en la autoridad V3");
  assert.equal(result.reason, "official_route_unavailable", "no cae al learner V2");
  assert.equal(completed.length, 1, "se registra un rechazo idempotente");
  assert.equal(completed[0].payload.status, "REJECTED");
  assert.equal(completed[0].payload.reason, "official_route_unavailable");

  console.log("ok - route learning V3: una Route ausente no cae al aprendizaje V2");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
