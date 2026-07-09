const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEmbeddedStore } = require("../src/data/store");

const expectedDomains = [
  "documents",
  "fleet",
  "incidents",
  "notifications",
  "organization",
  "payments",
  "sessions",
  "tracking",
  "users"
];

const store = createEmbeddedStore();

for (const domain of expectedDomains) {
  assert.ok(store.repositories?.[domain], `missing repository domain: ${domain}`);
  assert.ok(store.services?.[domain], `missing service domain: ${domain}`);
}

assert.equal(typeof store.getUserById, "function");
assert.equal(typeof store.services.users.getUserById, "function");
assert.equal(typeof store.getLiveLocations, "function");
assert.equal(typeof store.services.tracking.getLiveLocations, "function");
assert.equal(typeof store.createIncident, "function");
assert.equal(typeof store.services.incidents.createIncident, "function");
assert.equal(typeof store.createCommercialOrder, "function");
assert.equal(typeof store.services.payments.createCommercialOrder, "function");

const mongoStoreSource = fs.readFileSync(
  path.join(__dirname, "../src/data/mongo-store.js"),
  "utf8"
);
const extractedMongoMethods = [
  "getUserById",
  "findUserByEmail",
  "getCommercialOrderById",
  "listCommercialOrders",
  "listCommercialOrdersForUser",
  "findCommercialOrderByExternalReference",
  "updateCommercialOrder",
  "getDocumentByStorageKey",
  "createRtcSession",
  "updateRtcSession",
  "listRtcSessions",
  "recordAppEvent"
];

for (const methodName of extractedMongoMethods) {
  assert.equal(
    mongoStoreSource.includes(`async function ${methodName}`),
    false,
    `${methodName} should live outside mongo-store.js`
  );
}

console.log("backend architecture tests passed");
