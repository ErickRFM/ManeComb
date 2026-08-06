const HTTPS_PROTOCOL = "https:";

class PlatformAccessConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlatformAccessConfigurationError";
    this.code = "PLATFORM_ACCESS_CONFIGURATION_INVALID";
    this.statusCode = 503;
  }
}

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function getPlatformAccessConfiguration(env = process.env) {
  const enabled = parseBoolean(env.PLATFORM_ACCESS_ENFORCEMENT_ENABLED);
  const issuer = normalizeUrl(env.PLATFORM_ACCESS_ISSUER);
  const audience = String(env.PLATFORM_ACCESS_AUDIENCE || "").trim();
  const explicitJwksUrl = normalizeUrl(env.PLATFORM_ACCESS_JWKS_URL);
  const jwksUrl = explicitJwksUrl || (issuer ? `${issuer}/cdn-cgi/access/certs` : "");

  return {
    enabled,
    issuer,
    audience,
    jwksUrl,
    headerName: "cf-access-jwt-assertion"
  };
}

function isSecureUrl(value, { allowHttp = false } = {}) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === HTTPS_PROTOCOL || (allowHttp && url.protocol === "http:");
  } catch {
    return false;
  }
}

function assertPlatformAccessConfiguration(options = {}) {
  const config = options.config || getPlatformAccessConfiguration(options.env);
  if (!config.enabled) return config;

  const allowHttp = options.allowHttp === true || process.env.NODE_ENV === "test";
  if (!isSecureUrl(config.issuer, { allowHttp })) {
    throw new PlatformAccessConfigurationError("PLATFORM_ACCESS_ISSUER debe ser una URL HTTPS válida");
  }
  if (!config.audience || config.audience.length < 8 || config.audience.length > 256) {
    throw new PlatformAccessConfigurationError("PLATFORM_ACCESS_AUDIENCE no es válido");
  }
  if (!isSecureUrl(config.jwksUrl, { allowHttp })) {
    throw new PlatformAccessConfigurationError("PLATFORM_ACCESS_JWKS_URL no es válido");
  }

  return config;
}

module.exports = {
  PlatformAccessConfigurationError,
  parseBoolean,
  normalizeUrl,
  getPlatformAccessConfiguration,
  assertPlatformAccessConfiguration
};
