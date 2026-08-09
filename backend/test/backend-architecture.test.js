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
const socketSource = fs.readFileSync(
  path.join(__dirname, "../src/sockets/index.js"),
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

assert.match(
  socketSource,
  /socket\.on\("radio:join"[\s\S]*socket\.join\(liveRoom\)[\s\S]*socket\.join\(historyRoom\)[\s\S]*acknowledge\(ack, \{[\s\S]*ok: true/,
  "radio:join must join live and history rooms before acknowledging READY"
);
assert.match(
  socketSource,
  /const historyRoom = `conversation:\$\{channelId\}`;[\s\S]*io\.to\(historyRoom\)\.emit\("radio:message:new"/,
  "persisted radio messages must use the history room guaranteed by radio:join"
);

const activeSocketGuardIndex = socketSource.indexOf(
  "const activeForSocket = [...activeRadioTransmissions.values()].find"
);
const radioLockAcquireIndex = socketSource.indexOf("const lock = await radioFloor.acquire");
assert.ok(
  activeSocketGuardIndex > 0 && activeSocketGuardIndex < radioLockAcquireIndex,
  "radio:start must reject sockets that already transmit before acquiring a channel lock"
);

// El arbitraje distribuido tiene una sola implementacion: el handler de sockets
// consume la autoridad extraida y no vuelve a hablar con Redis por su cuenta.
assert.ok(
  socketSource.includes('require("../modules/radio/floor-control")'),
  "radio floor control must come from its dedicated module"
);
for (const inlined of ["manecomb:radio:channel:", "redis.call('get'", "NX: true"]) {
  assert.equal(
    socketSource.includes(inlined),
    false,
    `socket handler must not re-implement the radio lock (${inlined})`
  );
}

require("./subscription-realtime.test");

console.log("backend architecture tests passed");
