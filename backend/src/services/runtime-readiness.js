const { getAudioTranscriptionReadiness } = require("./audio-transcription");
const { getNotifierReadiness } = require("./commercial-notifier");
const { getPaymentReadiness } = require("./commercial-payment");
const { getRedisReadiness } = require("./redis");
const { getRtcReadiness } = require("./rtc-config");
const { getStorageReadiness } = require("./storage");
const communication = require("../../modules/communication");

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
  const redisRequiredButUnavailable = Boolean(redis.enabled && !redis.ready);

  const degraded =
    !databaseReady ||
    !storage.ready ||
    !payments.ready ||
    !rtc.ready ||
    redisRequiredButUnavailable ||
    (transcription.provider !== "none" && !transcription.ready) ||
    !notifications.email.ready ||
    !notifications.whatsapp.ready;

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
    status: degraded ? "degraded" : "ok"
  };
}

module.exports = {
  getRuntimeReadiness
};
