const assert = require("node:assert/strict");

const { sanitizeUser } = require("../src/data/serializers");
const {
  ACCOUNT_CHANNEL,
  resolveAccountChannel
} = require("../src/services/account-channel");

function buildUser(overrides = {}) {
  return {
    _id: "user-channel-test",
    name: "Channel Test",
    email: "channel@manecomb.test",
    passwordHash: "must-not-leak",
    role: "owner",
    accountType: "company_owner",
    organizationId: "tenant-channel",
    userStatus: "active",
    ...overrides
  };
}

function testSerializerDecoratesCompanyPortal() {
  const user = sanitizeUser(buildUser());

  assert.equal(user.accountChannel, "company_portal");
  assert.equal(user.accountChannelReason, "company_identity");
  assert.equal(user.passwordHash, undefined);
  console.log("ok - serializer emite company_portal sin datos sensibles");
}

function testSerializerDecoratesMobileOperations() {
  const user = sanitizeUser(buildUser({
    accountType: "operations",
    role: "driver"
  }));

  assert.equal(user.accountChannel, "mobile_operations");
  assert.equal(user.accountChannelReason, "operational_identity");
  console.log("ok - serializer emite mobile_operations");
}

function testInvalidCombinationsFailClosed() {
  const user = sanitizeUser(buildUser({ role: "driver" }));

  assert.equal(user.accountChannel, "blocked");
  assert.equal(user.accountChannelReason, "incompatible_company_role");
  console.log("ok - serializer bloquea combinaciones incompatibles");
}

function testSuspensionOverridesProductIdentity() {
  const resolution = resolveAccountChannel(buildUser({
    accountType: "operations",
    role: "driver",
    userStatus: "suspended"
  }));

  assert.equal(resolution.channel, ACCOUNT_CHANNEL.BLOCKED);
  assert.equal(resolution.reason, "account_suspended");
  console.log("ok - suspension domina el canal de producto");
}

function run() {
  testSerializerDecoratesCompanyPortal();
  testSerializerDecoratesMobileOperations();
  testInvalidCombinationsFailClosed();
  testSuspensionOverridesProductIdentity();
}

run();
