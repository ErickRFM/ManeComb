const { ENABLE_QUEUES, REDIS_URL } = require("../config/env");

const localQueues = new Map();
let bullmq = null;
let queueStatus = {
  enabled: ENABLE_QUEUES,
  ready: false,
  mode: ENABLE_QUEUES ? "configured" : "disabled",
  queues: []
};

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

function createLocalQueue(name) {
  const jobs = [];
  return {
    name,
    async add(jobName, payload, options = {}) {
      const job = {
        id: `${name}-${Date.now()}-${jobs.length + 1}`,
        name: jobName,
        payload,
        options,
        status: "queued",
        createdAt: new Date().toISOString()
      };
      jobs.push(job);
      return job;
    },
    async getJobCounts() {
      return {
        waiting: jobs.filter((job) => job.status === "queued").length,
        failed: jobs.filter((job) => job.status === "failed").length,
        completed: jobs.filter((job) => job.status === "completed").length
      };
    }
  };
}

function getQueue(name) {
  if (localQueues.has(name)) {
    return localQueues.get(name);
  }

  if (bullmq && ENABLE_QUEUES && REDIS_URL) {
    const queue = new bullmq.Queue(name, {
      connection: {
        url: REDIS_URL
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000
        },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    });
    localQueues.set(name, queue);
    return queue;
  }

  const queue = createLocalQueue(name);
  localQueues.set(name, queue);
  return queue;
}

async function initializeQueues() {
  try {
    if (ENABLE_QUEUES && REDIS_URL) {
      bullmq = require("bullmq");
      getQueueNames().forEach((name) => getQueue(name));
      queueStatus = {
        enabled: true,
        ready: true,
        mode: "bullmq",
        queues: getQueueNames()
      };
      return;
    }
  } catch (error) {
    bullmq = null;
    queueStatus = {
      enabled: true,
      ready: false,
      mode: "fallback",
      message: error.message,
      queues: getQueueNames()
    };
  }

  getQueueNames().forEach((name) => getQueue(name));
  queueStatus = {
    enabled: ENABLE_QUEUES,
    ready: false,
    mode: "memory",
    queues: getQueueNames()
  };
}

async function enqueue(name, jobName, payload, options = {}) {
  const queue = getQueue(name);
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
