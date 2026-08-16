const { getAudioTranscriptionReadiness } = require("./audio-transcription");
const { getNotifierReadiness } = require("./commercial-notifier");
const { getPaymentReadiness } = require("./commercial-payment");
const { getRedisReadiness } = require("./redis");
const { getRtcReadiness } = require("./rtc-config");
const { getStorageReadiness } = require("./storage");
const communication = require("../../modules/communication");

function classifyRuntimeReadiness({
  databaseReady,
  storage,
  payments,
  redis,
  queues,
  notifications,
  rtc,
  transcription
}) {
  const blockers = [];
  const degradedCapabilities = [];

  if (!databaseReady) {
    blockers.push("database");
  }
  if (redis?.enabled && !redis?.ready) {
    blockers.push("redis");
  }

  if (!storage?.ready) {
    degradedCapabilities.push("storage");
  }
  if (!payments?.ready) {
    degradedCapabilities.push("payments");
  }
  if (!rtc?.ready) {
    degradedCapabilities.push("rtc");
  }
  if (transcription?.provider !== "none" && !transcription?.ready) {
    degradedCapabilities.push("transcription");
  }
  if (!notifications?.email?.ready) {
    degradedCapabilities.push("email");
  }
  if (!notifications?.whatsapp?.ready) {
    degradedCapabilities.push("whatsapp");
  }
  if (queues?.enabled && !queues?.functional) {
    degradedCapabilities.push("communication_queue");
  }

  const ready = blockers.length === 0;
  const status = !ready
    ? "not_ready"
    : degradedCapabilities.length
      ? "degraded"
      : "ok";

  return {
    blockers,
    degradedCapabilities: Array.from(new Set(degradedCapabilities)),
    ready,
    status
  };
}

function getRuntimeReadiness(dbState) {
  const transcription = getAudioTranscriptionReadiness();
  const storage = getStorageReadiness();
  const payments = getPaymentReadiness();
  const notifications = getNotifierReadiness();
  const rtc = getRtcReadiness();
  const redis = getRedisReadiness();
  const communicationReadiness = communication.getReadiness();
  const queues = communicationReadiness.queue;
  const databaseReady = Boolean(dbState?.connected);
  const classification = classifyRuntimeReadiness({
    databaseReady,
    storage,
    payments,
    redis,
    queues,
    notifications,
    rtc,
    transcription
  });

  return {
    database: {
      connected: databaseReady,
      mode: dbState?.mode || "unknown",
      message: dbState?.message || ""
    },
    storage,
    payments,
    redis,
    queues,
    communication: communicationReadiness,
    notifications,
    rtc,
    transcription,
    ...classification
  };
}

module.exports = {
  classifyRuntimeReadiness,
  getRuntimeReadiness
};
