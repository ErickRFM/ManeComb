const unifiedQueue = require("../../../communication-service/src/queue");

const { ENABLE_QUEUES, REDIS_URL } = require("../config/env");

let queueStatus = {
  enabled: ENABLE_QUEUES,
  ready: false,
  mode: ENABLE_QUEUES ? "configured" : "disabled",
  queues: []
};

async function initializeQueues() {
  unifiedQueue.configure({
    enabled: Boolean(ENABLE_QUEUES && REDIS_URL),
    redisUrl: REDIS_URL || ""
  });

  const names = getQueueNames();
  names.forEach((name) => unifiedQueue.getQueue(name));

  queueStatus = {
    enabled: Boolean(ENABLE_QUEUES && REDIS_URL),
    ready: true,
    mode: (ENABLE_QUEUES && REDIS_URL) ? "bullmq" : "memory",
    queues: names
  };
}

function getQueueNames() {
  return [
    "emails",
    "whatsapp",
    "onboarding",
    "exports",
    "invoices",
    "webhooks",
    "push",
    "transcriptions",
    "audit"
  ];
}

function getQueue(name) {
  return unifiedQueue.getQueue(name);
}

async function enqueue(name, jobName, payload, options = {}) {
  const queue = unifiedQueue.getQueue(name);
  return await queue.add(jobName, payload, options);
}

function getQueueReadiness() {
  return { ...queueStatus };
}

module.exports = {
  enqueue,
  getQueue,
  getQueueReadiness,
  initializeQueues
};
