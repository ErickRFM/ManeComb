const crypto = require("node:crypto");

function parseBoolean(value, fallbackValue) {
  if (typeof value === "undefined" || value === null || value === "") {
    return fallbackValue;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  return fallbackValue;
}

function parseOrigins(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue || rawValue === "*") {
    return ["*"];
  }

  return rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getFirstPublicOrigin(value) {
  return parseOrigins(value).find((origin) => /^https?:\/\//.test(origin) && !origin.includes("*")) || "";
}

function readFirstEnv(candidates) {
  for (const name of candidates) {
    const value = String(process.env[name] || "").trim();

    if (value) {
      return {
        name,
        value
      };
    }
  }

  return {
    name: "",
    value: ""
  };
}

const DEFAULT_CLIENT_ORIGINS = [
  "https://manecomb1.pages.dev",
  "https://*.manecomb1.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

function mergeOrigins(...originLists) {
  const uniqueOrigins = new Set();

  originLists.flat().forEach((origin) => {
    if (origin) {
      uniqueOrigins.add(origin);
    }
  });

  return Array.from(uniqueOrigins);
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function originMatchesPattern(origin, pattern) {
  if (pattern === "*") {
    return true;
  }

  if (!pattern.includes("*")) {
    return origin === pattern;
  }

  const expression = `^${pattern.split("*").map(escapeRegex).join(".*")}$`;
  return new RegExp(expression).test(origin);
}

function isClientOriginAllowed(origin) {
  if (!origin || CLIENT_ORIGINS.includes("*")) {
    return true;
  }

  return CLIENT_ORIGINS.some((allowedOrigin) => originMatchesPattern(origin, allowedOrigin));
}

const DEFAULT_JWT_SECRET = "combis-app-secret";
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";
const IS_RENDER_RUNTIME = parseBoolean(
  process.env.RENDER,
  Boolean(process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL)
);
const NODE_ENV = IS_RENDER_RUNTIME ? "production" : process.env.NODE_ENV || "development";
const IS_PRODUCTION_RUNTIME = NODE_ENV === "production" || IS_RENDER_RUNTIME;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const jwtSecretCandidates = [
  ["JWT_SECRET", process.env.JWT_SECRET],
  ["AUTH_SECRET", process.env.AUTH_SECRET],
  ["SESSION_SECRET", process.env.SESSION_SECRET],
  ["ACCESS_TOKEN_SECRET", process.env.ACCESS_TOKEN_SECRET]
]
  .map(([name, value]) => [name, String(value || "").trim()])
  .filter(([, value]) => value);
const configuredJwtSecret = jwtSecretCandidates[0];
const configuredJwtSecretIsStrong = Boolean(configuredJwtSecret?.[1] && configuredJwtSecret[1].length >= 32);
const jwtSecretDerivationSource = configuredJwtSecret?.[1]
  ? [configuredJwtSecret[0], configuredJwtSecret[1]]
  : MONGO_URI
    ? ["MONGO_URI", MONGO_URI]
    : null;
const derivedJwtSecret =
  IS_PRODUCTION_RUNTIME && jwtSecretDerivationSource
    ? crypto
        .createHash("sha256")
        .update(
          [
            "manecomb-jwt",
            jwtSecretDerivationSource[0],
            jwtSecretDerivationSource[1],
            process.env.RENDER_SERVICE_ID || "",
            process.env.RENDER_EXTERNAL_URL || ""
          ].join("|")
        )
        .digest("hex")
    : "";
const JWT_SECRET = configuredJwtSecretIsStrong ? configuredJwtSecret[1] : derivedJwtSecret || DEFAULT_JWT_SECRET;
const JWT_SECRET_SOURCE = configuredJwtSecretIsStrong
  ? configuredJwtSecret[0]
  : derivedJwtSecret
    ? configuredJwtSecret?.[0]
      ? `${configuredJwtSecret[0]}_derived`
      : "derived_from_mongo_uri"
    : "default";
if (IS_PRODUCTION_RUNTIME && (JWT_SECRET === DEFAULT_JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error(
    "JWT_SECRET es obligatorio en produccion y debe tener al menos 32 caracteres. " +
      "Configura JWT_SECRET en Render; si ya existe pero es corto, el backend lo derivara a un secreto estable."
  );
}
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_TOKEN_TTL_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30);
const CHAT_ENCRYPTION_SECRET = process.env.CHAT_ENCRYPTION_SECRET || JWT_SECRET;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "combisapp";
const MONGO_SERVER_SELECTION_TIMEOUT_MS = Number(
  process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 8000
);
const REQUIRE_MONGO = parseBoolean(process.env.REQUIRE_MONGO, true);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || DEFAULT_CLIENT_ORIGINS.join(",");
const configuredClientOrigins = parseOrigins(CLIENT_ORIGIN);
const CLIENT_ORIGINS = configuredClientOrigins.includes("*")
  ? ["*"]
  : mergeOrigins(DEFAULT_CLIENT_ORIGINS, configuredClientOrigins);
const CORS_ORIGIN = CLIENT_ORIGINS.includes("*")
  ? "*"
  : (origin, callback) => callback(null, isClientOriginAllowed(origin));
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.MANECOMB_MAPBOX_ACCESS_TOKEN || "";
const MAP_GEOCODING_PROVIDER = String(process.env.MAP_GEOCODING_PROVIDER || "mapbox").trim().toLowerCase();
const MAP_ROUTING_PROVIDER = String(process.env.MAP_ROUTING_PROVIDER || "mapbox").trim().toLowerCase();
const PHOTON_API_URL = process.env.PHOTON_API_URL || "https://photon.komoot.io";
const NOMINATIM_API_URL = process.env.NOMINATIM_API_URL || "https://nominatim.openstreetmap.org";
const OSRM_API_URL = process.env.OSRM_API_URL || "https://router.project-osrm.org";
const VALHALLA_API_URL = process.env.VALHALLA_API_URL || "";
const MAP_HTTP_USER_AGENT = process.env.MAP_HTTP_USER_AGENT || "ManeComb/1.0";
const APP_URL =
  process.env.APP_URL ||
  process.env.CLIENT_URL ||
  getFirstPublicOrigin(process.env.CLIENT_ORIGIN) ||
  (IS_PRODUCTION_RUNTIME ? DEFAULT_CLIENT_ORIGINS[0] : "http://localhost:8081");
const PUBLIC_WEBHOOK_BASE_URL =
  process.env.PUBLIC_WEBHOOK_BASE_URL || process.env.RENDER_EXTERNAL_URL || "";
const MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES = [
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MP_ACCESS_TOKEN"
];
const MERCADO_PAGO_ENV_NAMES = [
  "MERCADO_PAGO_ENV",
  "MERCADOPAGO_ENV",
  "MP_ENV"
];
const MERCADO_PAGO_PUBLIC_KEY_ENV_NAMES = [
  "MERCADO_PAGO_PUBLIC_KEY",
  "MERCADOPAGO_PUBLIC_KEY",
  "MP_PUBLIC_KEY"
];
const MERCADO_PAGO_WEBHOOK_SECRET_ENV_NAMES = [
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "MERCADOPAGO_WEBHOOK_SECRET",
  "MP_WEBHOOK_SECRET",
  "WEBHOOK_SECRET"
];
const MERCADO_PAGO_SUCCESS_URL_ENV_NAMES = [
  "MERCADO_PAGO_SUCCESS_URL",
  "MERCADOPAGO_SUCCESS_URL",
  "MP_SUCCESS_URL",
  "SUCCESS_URL"
];
const MERCADO_PAGO_FAILURE_URL_ENV_NAMES = [
  "MERCADO_PAGO_FAILURE_URL",
  "MERCADOPAGO_FAILURE_URL",
  "MP_FAILURE_URL",
  "FAILURE_URL"
];
const MERCADO_PAGO_PENDING_URL_ENV_NAMES = [
  "MERCADO_PAGO_PENDING_URL",
  "MERCADOPAGO_PENDING_URL",
  "MP_PENDING_URL",
  "PENDING_URL"
];
const MERCADO_PAGO_WEBHOOK_URL_ENV_NAMES = [
  "MERCADO_PAGO_WEBHOOK_URL",
  "MERCADOPAGO_WEBHOOK_URL",
  "MP_WEBHOOK_URL",
  "WEBHOOK_URL"
];
const DOCUMENT_STORAGE_DRIVER = process.env.DOCUMENT_STORAGE_DRIVER || "mongo";
const COMMERCIAL_BRAND_NAME = process.env.COMMERCIAL_BRAND_NAME || "ManeComb";
const COMMERCIAL_LEGAL_NAME = process.env.COMMERCIAL_LEGAL_NAME || "";
const COMMERCIAL_SUPPORT_EMAIL = process.env.COMMERCIAL_SUPPORT_EMAIL || "";
const COMMERCIAL_SUPPORT_PHONE = process.env.COMMERCIAL_SUPPORT_PHONE || "";
const BANK_TRANSFER_ACCOUNT_NAME = process.env.BANK_TRANSFER_ACCOUNT_NAME || "";
const BANK_TRANSFER_CLABE = process.env.BANK_TRANSFER_CLABE || "";
const BANK_TRANSFER_BANK_NAME = process.env.BANK_TRANSFER_BANK_NAME || "";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || "mercado_pago";
const mercadoPagoAccessToken = readFirstEnv(MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES);
const mercadoPagoEnv = readFirstEnv(MERCADO_PAGO_ENV_NAMES);
const mercadoPagoPublicKey = readFirstEnv(MERCADO_PAGO_PUBLIC_KEY_ENV_NAMES);
const mercadoPagoWebhookSecret = readFirstEnv(MERCADO_PAGO_WEBHOOK_SECRET_ENV_NAMES);
const mercadoPagoSuccessUrl = readFirstEnv(MERCADO_PAGO_SUCCESS_URL_ENV_NAMES);
const mercadoPagoFailureUrl = readFirstEnv(MERCADO_PAGO_FAILURE_URL_ENV_NAMES);
const mercadoPagoPendingUrl = readFirstEnv(MERCADO_PAGO_PENDING_URL_ENV_NAMES);
const mercadoPagoWebhookUrl = readFirstEnv(MERCADO_PAGO_WEBHOOK_URL_ENV_NAMES);
const appUrlWithoutSlash = APP_URL.replace(/\/$/, "");
const MERCADO_PAGO_ACCESS_TOKEN = mercadoPagoAccessToken.value;
const MERCADO_PAGO_ACCESS_TOKEN_SOURCE = mercadoPagoAccessToken.name;
const MERCADO_PAGO_ENV = mercadoPagoEnv.value;
const MERCADO_PAGO_ENV_SOURCE = mercadoPagoEnv.name;
const MERCADO_PAGO_PUBLIC_KEY = mercadoPagoPublicKey.value;
const MERCADO_PAGO_PUBLIC_KEY_SOURCE = mercadoPagoPublicKey.name;
const MERCADO_PAGO_WEBHOOK_SECRET = mercadoPagoWebhookSecret.value;
const MERCADO_PAGO_WEBHOOK_SECRET_SOURCE = mercadoPagoWebhookSecret.name;
const MERCADO_PAGO_SUCCESS_URL =
  mercadoPagoSuccessUrl.value || `${appUrlWithoutSlash}/ventas/?checkout=success`;
const MERCADO_PAGO_SUCCESS_URL_SOURCE = mercadoPagoSuccessUrl.name || "APP_URL";
const MERCADO_PAGO_FAILURE_URL =
  mercadoPagoFailureUrl.value || `${appUrlWithoutSlash}/ventas/?checkout=failure`;
const MERCADO_PAGO_FAILURE_URL_SOURCE = mercadoPagoFailureUrl.name || "APP_URL";
const MERCADO_PAGO_PENDING_URL =
  mercadoPagoPendingUrl.value || `${appUrlWithoutSlash}/ventas/?checkout=pending`;
const MERCADO_PAGO_PENDING_URL_SOURCE = mercadoPagoPendingUrl.name || "APP_URL";
const MERCADO_PAGO_WEBHOOK_URL =
  mercadoPagoWebhookUrl.value ||
  (PUBLIC_WEBHOOK_BASE_URL
    ? `${PUBLIC_WEBHOOK_BASE_URL.replace(/\/$/, "")}/api/commercial/webhooks/mercadopago`
    : "");
const MERCADO_PAGO_WEBHOOK_URL_SOURCE = mercadoPagoWebhookUrl.name || (PUBLIC_WEBHOOK_BASE_URL ? "PUBLIC_WEBHOOK_BASE_URL" : "");
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const TURN_URLS = String(process.env.TURN_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const TURN_USERNAME = process.env.TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || "";
const TURN_SECRET = process.env.TURN_SECRET || "";
const TURN_REALM = process.env.TURN_REALM || "";
const TURN_CREDENTIAL_TTL_SECONDS = Math.max(
  60,
  Number(process.env.TURN_CREDENTIAL_TTL_SECONDS) || 3600
);
const SENTRY_DSN = process.env.SENTRY_DSN || "";
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
const AUDIO_TRANSCRIPTION_PROVIDER = process.env.AUDIO_TRANSCRIPTION_PROVIDER || "none";
const AUDIO_TRANSCRIPTION_API_URL = process.env.AUDIO_TRANSCRIPTION_API_URL || "";
const AUDIO_TRANSCRIPTION_API_KEY = process.env.AUDIO_TRANSCRIPTION_API_KEY || "";
const AUDIO_TRANSCRIPTION_MODEL = process.env.AUDIO_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const AUDIO_TRANSCRIPTION_LANGUAGE = process.env.AUDIO_TRANSCRIPTION_LANGUAGE || "es";
const REDIS_URL = process.env.REDIS_URL || "";
const ENABLE_REDIS = parseBoolean(process.env.ENABLE_REDIS, false);
const ENABLE_QUEUES = parseBoolean(process.env.ENABLE_QUEUES, false);
const TRUST_PROXY = parseBoolean(process.env.TRUST_PROXY, IS_RENDER_RUNTIME);
const RUNTIME_COMMIT =
  process.env.RENDER_GIT_COMMIT ||
  process.env.GIT_COMMIT ||
  process.env.COMMIT_SHA ||
  "";

module.exports = {
  APP_URL,
  HOST,
  PORT,
  NODE_ENV,
  IS_PRODUCTION_RUNTIME,
  JWT_SECRET,
  JWT_SECRET_SOURCE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  CHAT_ENCRYPTION_SECRET,
  MONGO_URI,
  MONGO_DB_NAME,
  MONGO_SERVER_SELECTION_TIMEOUT_MS,
  REQUIRE_MONGO,
  CLIENT_ORIGIN,
  CLIENT_ORIGINS,
  DEFAULT_CLIENT_ORIGINS,
  CORS_ORIGIN,
  isClientOriginAllowed,
  MAPBOX_ACCESS_TOKEN,
  MAP_GEOCODING_PROVIDER,
  MAP_ROUTING_PROVIDER,
  MAP_HTTP_USER_AGENT,
  NOMINATIM_API_URL,
  OSRM_API_URL,
  PHOTON_API_URL,
  VALHALLA_API_URL,
  PUBLIC_WEBHOOK_BASE_URL,
  DOCUMENT_STORAGE_DRIVER,
  COMMERCIAL_BRAND_NAME,
  COMMERCIAL_LEGAL_NAME,
  COMMERCIAL_SUPPORT_EMAIL,
  COMMERCIAL_SUPPORT_PHONE,
  BANK_TRANSFER_ACCOUNT_NAME,
  BANK_TRANSFER_CLABE,
  BANK_TRANSFER_BANK_NAME,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  PAYMENT_PROVIDER,
  MERCADO_PAGO_ACCESS_TOKEN,
  MERCADO_PAGO_ACCESS_TOKEN_SOURCE,
  MERCADO_PAGO_ACCESS_TOKEN_ENV_NAMES,
  MERCADO_PAGO_ENV,
  MERCADO_PAGO_ENV_SOURCE,
  MERCADO_PAGO_ENV_NAMES,
  MERCADO_PAGO_PUBLIC_KEY,
  MERCADO_PAGO_PUBLIC_KEY_SOURCE,
  MERCADO_PAGO_PUBLIC_KEY_ENV_NAMES,
  MERCADO_PAGO_WEBHOOK_SECRET,
  MERCADO_PAGO_WEBHOOK_SECRET_SOURCE,
  MERCADO_PAGO_WEBHOOK_SECRET_ENV_NAMES,
  MERCADO_PAGO_SUCCESS_URL,
  MERCADO_PAGO_SUCCESS_URL_SOURCE,
  MERCADO_PAGO_SUCCESS_URL_ENV_NAMES,
  MERCADO_PAGO_FAILURE_URL,
  MERCADO_PAGO_FAILURE_URL_SOURCE,
  MERCADO_PAGO_FAILURE_URL_ENV_NAMES,
  MERCADO_PAGO_PENDING_URL,
  MERCADO_PAGO_PENDING_URL_SOURCE,
  MERCADO_PAGO_PENDING_URL_ENV_NAMES,
  MERCADO_PAGO_WEBHOOK_URL,
  MERCADO_PAGO_WEBHOOK_URL_SOURCE,
  MERCADO_PAGO_WEBHOOK_URL_ENV_NAMES,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
  TURN_URLS,
  TURN_USERNAME,
  TURN_CREDENTIAL,
  TURN_SECRET,
  TURN_REALM,
  TURN_CREDENTIAL_TTL_SECONDS,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  AUDIO_TRANSCRIPTION_PROVIDER,
  AUDIO_TRANSCRIPTION_API_URL,
  AUDIO_TRANSCRIPTION_API_KEY,
  AUDIO_TRANSCRIPTION_MODEL,
  AUDIO_TRANSCRIPTION_LANGUAGE,
  REDIS_URL,
  ENABLE_REDIS,
  ENABLE_QUEUES,
  IS_RENDER_RUNTIME,
  RUNTIME_COMMIT,
  TRUST_PROXY
};
