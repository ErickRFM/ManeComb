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

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "combis-app-secret";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30);
const CHAT_ENCRYPTION_SECRET = process.env.CHAT_ENCRYPTION_SECRET || JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "combisapp";
const MONGO_SERVER_SELECTION_TIMEOUT_MS = Number(
  process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 8000
);
const REQUIRE_MONGO = parseBoolean(process.env.REQUIRE_MONGO, true);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const APP_URL = process.env.APP_URL || "http://localhost:8081";
const PUBLIC_WEBHOOK_BASE_URL = process.env.PUBLIC_WEBHOOK_BASE_URL || "";
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
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
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
const TRUST_PROXY = parseBoolean(process.env.TRUST_PROXY, false);

module.exports = {
  APP_URL,
  HOST,
  PORT,
  JWT_SECRET,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  CHAT_ENCRYPTION_SECRET,
  MONGO_URI,
  MONGO_DB_NAME,
  MONGO_SERVER_SELECTION_TIMEOUT_MS,
  REQUIRE_MONGO,
  CLIENT_ORIGIN,
  GOOGLE_MAPS_API_KEY,
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
  TRUST_PROXY
};
