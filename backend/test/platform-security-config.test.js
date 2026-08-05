const assert = require("node:assert/strict");
const {
  PlatformSecurityConfigurationError,
  isValidPlatformJwtSecret,
  isValidPlatformMfaEncryptionKey,
  getPlatformSecurityStatus,
  assertPlatformSecurityConfiguration
} = require("../src/config/platform-security");

const VALID_JWT = "platform-test-jwt-secret-with-more-than-32-characters";
const VALID_MFA = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";

assert.equal(isValidPlatformJwtSecret(VALID_JWT), true);
assert.equal(isValidPlatformJwtSecret("short"), false);
assert.equal(isValidPlatformMfaEncryptionKey(VALID_MFA), true);
assert.equal(isValidPlatformMfaEncryptionKey("not-base64"), false);
assert.equal(isValidPlatformMfaEncryptionKey(Buffer.alloc(31).toString("base64")), false);

const ready = getPlatformSecurityStatus({ jwtSecret: VALID_JWT, mfaEncryptionKey: VALID_MFA });
assert.deepEqual(ready, {
  configured: true,
  jwtConfigured: true,
  mfaConfigured: true,
  jwtReady: true,
  mfaReady: true,
  ready: true
});

const disabled = assertPlatformSecurityConfiguration({ production: true, jwtSecret: "", mfaEncryptionKey: "" });
assert.equal(disabled.configured, false);
assert.equal(disabled.ready, false);

assert.throws(
  () => assertPlatformSecurityConfiguration({ production: true, jwtSecret: VALID_JWT, mfaEncryptionKey: "" }),
  (error) => error instanceof PlatformSecurityConfigurationError && error.statusCode === 503
);
assert.throws(
  () => assertPlatformSecurityConfiguration({ production: true, jwtSecret: "", mfaEncryptionKey: VALID_MFA }),
  (error) => error.code === "PLATFORM_SECURITY_CONFIGURATION_INVALID"
);
assert.throws(
  () => assertPlatformSecurityConfiguration({ production: true, jwtSecret: "short", mfaEncryptionKey: VALID_MFA }),
  PlatformSecurityConfigurationError
);

const developmentPartial = assertPlatformSecurityConfiguration({ production: false, jwtSecret: VALID_JWT, mfaEncryptionKey: "" });
assert.equal(developmentPartial.configured, true);
assert.equal(developmentPartial.ready, false);

console.log("ok - platform security configuration is fail-closed");
