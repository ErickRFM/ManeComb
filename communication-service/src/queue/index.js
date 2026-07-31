const { Queue: BullQueue, Worker, UnrecoverableError } = require("bullmq");
const { QUEUE_NAMES } = require("../core/types");

let bullmqAvailable = false;
let enabled = false;
let redisUrl = "";
let queueConnected = false;
let workerStarted = false;
let durableAcrossRestart = false;
let maxmemoryPolicy = "unknown";
const localQueues = {};
const localWorkers = {};

function configure(config) {
  enabled = Boolean(config.enabled && config.redisUrl);
  redisUrl = config.redisUrl || "";
  bullmqAvailable = enabled;
  durableAcrossRestart = Boolean(enabled && config.persistence);
  maxmemoryPolicy = String(config.maxmemoryPolicy || "unknown").trim().toLowerCase();
  if (!enabled) queueConnected = false;
}

function createBullQueue(name) {
  const queue = new BullQueue(name, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  });
  queue.on("error", () => {
    queueConnected = false;
  });
  queue.waitUntilReady().then(() => {
    queueConnected = true;
  }).catch(() => {
    queueConnected = false;
  });
  return queue;
}

function createLocalQueue(name) {
  const jobs = [];
  const consumers = [];

  return {
    name,
    async add(jobName, payload, options = {}) {
      const job = {
        id: options.jobId || `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: jobName,
        payload,
        options,
        status: "queued",
        createdAt: new Date().toISOString(),
        attemptsMade: 0
      };
      jobs.push(job);

      setImmediate(async () => {
        for (const consumer of consumers) {
          try {
            const result = await consumer({ id: job.id, name: jobName, data: payload, opts: options, attemptsMade: job.attemptsMade, local: true });
            if (result?.fatal) throw new Error(result.error || "Permanent email delivery failure");
            job.status = "completed";
          } catch (err) {
            job.status = "failed";
            job.error = err.message;
          }
        }
      });

      return job;
    },
    process(consumer) {
      consumers.push(consumer);
    },
    async getJobCounts() {
      return {
        waiting: jobs.filter((j) => j.status === "queued").length,
        failed: jobs.filter((j) => j.status === "failed").length,
        completed: jobs.filter((j) => j.status === "completed").length
      };
    }
  };
}

function getQueue(name) {
  if (!localQueues[name]) {
    localQueues[name] = bullmqAvailable ? createBullQueue(name) : createLocalQueue(name);
  }
  return localQueues[name];
}

function createWorker(queueName, processor) {
  workerStarted = true;
  if (bullmqAvailable) {
    const worker = new Worker(
      queueName,
      async (job) => {
        const result = await processor({ id: job.id, name: job.name, data: job.data, attemptsMade: job.attemptsMade, opts: job.opts, local: false });
        if (result?.fatal) throw new UnrecoverableError(result.error || "Permanent email delivery failure");
        return result;
      },
      {
        connection: { url: redisUrl },
        concurrency: 5
      }
    );
    worker.on("failed", (job, err) => {
      try {
        const logger = require("../logger");
        logger.logWarn("QueueJobFailed", `Job ${job?.name} en cola ${queueName} falló`, {
          jobId: job?.id,
          queueName,
          error: err?.message
        });
      } catch {}
    });
    worker.on("ready", () => {
      queueConnected = true;
    });
    worker.on("error", () => {
      queueConnected = false;
    });
    localWorkers[queueName] = worker;
    return worker;
  }

  const queue = getQueue(queueName);
  queue.process((job) => {
    return processor({ id: job.id, name: job.name, data: job.payload || job.data, attemptsMade: job.attemptsMade || 0, opts: job.options || job.opts, local: true });
  });
  return null;
}

async function enqueue(name, jobName, payload, options = {}) {
  const queue = getQueue(name);
  return await queue.add(jobName, payload, options);
}

async function initialize(timeoutMs = 5000) {
  if (!bullmqAvailable) return getReadiness();
  const resources = [
    ...Object.values(localQueues),
    ...Object.values(localWorkers)
  ].filter((resource) => typeof resource?.waitUntilReady === "function");
  if (!resources.length) return getReadiness();

  let timeoutId;
  try {
    await Promise.race([
      Promise.all(resources.map((resource) => resource.waitUntilReady())),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Email queue readiness timeout")), timeoutMs);
      })
    ]);
    queueConnected = true;
  } catch {
    queueConnected = false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  return getReadiness();
}

function getReadiness() {
  const functional = bullmqAvailable
    ? queueConnected && workerStarted
    : workerStarted;
  return {
    enabled: Boolean(bullmqAvailable),
    mode: bullmqAvailable ? "bullmq" : "memory",
    queues: Object.keys(localQueues),
    connected: Boolean(bullmqAvailable && queueConnected),
    functional,
    workerStarted,
    maxmemoryPolicy,
    persistence: durableAcrossRestart,
    durableAcrossRestart,
    ready: functional,
    durable: durableAcrossRestart,
    degraded: !durableAcrossRestart
  };
}

function getQueueReadiness() {
  return getReadiness();
}

module.exports = {
  configure,
  getQueue,
  createWorker,
  enqueue,
  initialize,
  getReadiness,
  getQueueReadiness,
  QUEUE_NAMES
};
