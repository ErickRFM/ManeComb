const { createWorker } = require("./communication.queue");
const history = require("./communication.history");
const metrics = require("./communication.metrics");
const logger = require("../../src/services/logger");

process.on("unhandledRejection", (reason) => {
  logger.error({
    action: "UnhandledRejection",
    module: "Communication",
    message: reason?.message || String(reason),
    error: reason,
    metadata: { section: "jobs" }
  });
});

let sendFn = null;

function setSendFunction(fn) {
  sendFn = fn;
}

function createEmailWorker() {
  return createWorker("emails", async (job) => {
    const { to, template, data, priority, provider, from } = job.data;
    const startTime = Date.now();

    metrics.increment("emails_attempted", 1, { template, provider: provider || "resend" });

    try {
      if (!sendFn) {
        throw new Error("sendFn no configurado");
      }

      const result = await sendFn({
        to,
        template,
        data,
        priority,
        provider,
        from
      });

      if (!result.success) {
        throw new Error(result.error || "Email send failed");
      }

      const duration = Date.now() - startTime;

      metrics.increment("emails_sent", 1, { template, provider: result.provider || provider || "resend" });
      metrics.observeDuration("email_send_duration_ms", duration, { template, provider: result.provider || provider || "resend" });

      await history.log({
        to: Array.isArray(to) ? to : [to],
        template,
        provider: result.provider || provider || "resend",
        status: "sent",
        durationMs: duration,
        messageId: result.messageId || result.id || null,
        error: null,
        metadata: { userId: data.userId, organizationId: data.organizationId }
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      metrics.increment("emails_failed", 1, { template, provider: provider || "resend" });

      await history.log({
        to: Array.isArray(to) ? to : [to],
        template,
        provider: provider || "resend",
        status: "failed",
        durationMs: duration,
        messageId: null,
        error: error.message || String(error),
        metadata: { userId: data.userId, organizationId: data.organizationId }
      });

      logger.error({
        action: "EmailSendFailed",
        module: "Communication",
        message: `Error enviando correo (plantilla: ${template})`,
        error,
        metadata: { jobId: job.id, template, to }
      });

      throw error;
    }
  });
}

function createWhatsAppWorker() {
  return createWorker("whatsapp", async (job) => {
    const startTime = Date.now();

    metrics.increment("whatsapp_attempted", 1, { template: job.data.template });

    try {
      if (!sendFn) {
        throw new Error("sendFn no configurado");
      }

      const result = await sendFn({
        channel: "whatsapp",
        to: job.data.to,
        template: job.data.template,
        data: job.data.data
      });

      if (!result.success) {
        throw new Error(result.error || "WhatsApp send failed");
      }

      const duration = Date.now() - startTime;

      metrics.increment("whatsapp_sent", 1, { template: job.data.template });
      metrics.observeDuration("whatsapp_send_duration_ms", duration, { template: job.data.template });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      metrics.increment("whatsapp_failed", 1, { template: job.data.template });

      logger.error({
        action: "WhatsAppSendFailed",
        module: "Communication",
        message: "Error enviando WhatsApp",
        error,
        metadata: { jobId: job.id, template: job.data.template }
      });

      throw error;
    }
  });
}

module.exports = {
  setSendFunction,
  createEmailWorker,
  createWhatsAppWorker
};
