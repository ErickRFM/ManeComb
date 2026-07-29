const { createWorker } = require("../queue");

let deliveryEngine = null;
let emailWorkerCreated = false;

function setDeliveryEngine(engine) {
  deliveryEngine = engine;
}

function setSendFunction() {}

function createEmailWorker() {
  if (emailWorkerCreated) return null;
  emailWorkerCreated = true;
  return createWorker("emails", async (job) => {
    if (!deliveryEngine) throw new Error("Delivery engine not configured");
    try {
      return await deliveryEngine.processQueued(job);
    } catch (error) {
      if (error.retryable === false) return { success: false, fatal: true, category: error.category };
      throw error;
    }
  });
}

function createWhatsAppWorker() {
  return null;
}

module.exports = { setDeliveryEngine, setSendFunction, createEmailWorker, createWhatsAppWorker };
