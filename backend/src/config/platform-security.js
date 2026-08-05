const {
  IS_PRODUCTION_RUNTIME,
  PLATFORM_JWT_SECRET,
  PLATFORM_MFA_ENCRYPTION_KEY
} = require("./env");

class PlatformSecurityConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlatformSecurityConfigurationError";
    this.code = "PLATFORM_SECURITY_CONFIGURATION_INVALID";
    this.statusCode = 503;
  }
}

function isValidPlatformJwtSecret(value = PLATFORM_JWT_SECRET) {
  return String(value || "").trim().length >= 32;
}

function isValidPlatformMfaEncryptionKey(value = PLATFORM_MFA_ENCRYPTION_KEY) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return false;
  try {
    const decoded = Buffer.from(normalized, "base64");
    return decoded.length === 32 && decoded.toString("base64") === normalized;
  } catch {
    return false;
  }
}

function getPlatformSecurityStatus(overrides = {}) {
  const jwtSecret = Object.prototype.hasOwnProperty.call(overrides, "jwtSecret")
    ? overrides.jwtSecret
    : PLATFORM_JWT_SECRET;
  const mfaEncryptionKey = Object.prototype.hasOwnProperty.call(overrides, "mfaEncryptionKey")
    ? overrides.mfaEncryptionKey
    : PLATFORM_MFA_ENCRYPTION_KEY;
  const jwtConfigured = Boolean(String(jwtSecret || "").trim());
  const mfaConfigured = Boolean(String(mfaEncryptionKey || "").trim());
  const jwtReady = isValidPlatformJwtSecret(jwtSecret);
  const mfaReady = isValidPlatformMfaEncryptionKey(mfaEncryptionKey);
  return {
    configured: jwtConfigured || mfaConfigured,
    jwtConfigured,
    mfaConfigured,
    jwtReady,
    mfaReady,
    ready: jwtReady && mfaReady
  };
}

function assertPlatformSecurityConfiguration(options = {}) {
  const production = Object.prototype.hasOwnProperty.call(options, "production")
    ? Boolean(options.production)
    : IS_PRODUCTION_RUNTIME;
  const status = getPlatformSecurityStatus(options);
  if (production && status.configured && !status.ready) {
    throw new PlatformSecurityConfigurationError(
      "La configuración de Admin Global está incompleta: PLATFORM_JWT_SECRET y PLATFORM_MFA_ENCRYPTION_KEY deben ser válidos."
    );
  }
  return status;
}

module.exports = {
  PlatformSecurityConfigurationError,
  isValidPlatformJwtSecret,
  isValidPlatformMfaEncryptionKey,
  getPlatformSecurityStatus,
  assertPlatformSecurityConfiguration
};
