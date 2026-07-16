const { Queue: BullQueue, Worker } = require("bullmq");
const { QUEUE_NAMES } = require("./communication.types");
const logger = require("../../src/services/logger");

let bullmqAvailable = false;
let enabled = false;
let redisUrl = "";

function configure(config) {
  enabled = Boolean(config.enabled && config.redisUrl);
  redisUrl = config.redisUrl || "";
  bullmqAvailable = enabled;
}

function createBullQueue(name) {
  return new BullQueue(name, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  });
}

const localQueues = {};
const localWorkers = {};

function createLocalQueue(name) {
  const jobs = [];
  const consumers = [];

  return {
    name,
    async add(jobName, payload, options = {}) {
      const job = {
        id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: jobName,
        payload,
        options,
        status: "queued",
        createdAt: new Date().toISOString()
      };
      jobs.push(job);

      setImmediate(async () => {
        for (const consumer of consumers) {
          try {
            await consumer({ id: job.id, name: jobName, data: payload, opts: options });
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
  if (bullmqAvailable) {
    const worker = new Worker(
      queueName,
      async (job) => {
        return await processor({ id: job.id, name: job.name, data: job.data });
      },
      {
        connection: { url: redisUrl },
        concurrency: 5
      }
    );
    worker.on("failed", (job, err) => {
      logger.error({
        action: "QueueJobFailed",
        module: "Communication",
        message: `Job ${job?.name} en cola ${queueName} falló`,
        error: err,
        metadata: { jobId: job?.id, queueName }
      });
    });
    return worker;
  }

  const queue = getQueue(queueName);
  queue.process((job) => {
    return processor({ id: job.id, name: job.name, data: job.payload || job.data });
  });
  return null;
}

function getReadiness() {
  return {
    enabled: Boolean(bullmqAvailable),
    mode: bullmqAvailable ? "bullmq" : "memory",
    queues: localQueues,
    ready: true
  };
}

module.exports = {
  configure,
  getQueue,
  createWorker,
  getReadiness
};
