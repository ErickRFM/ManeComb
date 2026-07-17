const { createWorker } = require("../queue");
const history = require("../history");
const metrics = require("../metrics");
const logger = require("../logger");
const { classifyError } = require("../errors");

let sendFn = null;

function setSendFunction(fn) {
  sendFn = fn;
}

function createEmailWorker() {
  return createWorker("emails", async (job) => {
    const { to, template, data, priority, provider, from, deliveryId } = job.data;
    const startTime = Date.now();
    const attempt = (job.attemptsMade || 0) + 1;

    metrics.increment("emails_attempted", 1, { template, provider: provider || "resend" });
    metrics.increment("emails_retry_attempt", 1, { attempt: String(attempt) });

    try {
      if (!sendFn) {
        throw new Error("sendFn not configured");
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

      metrics.increment("emails_sent", 1, { template, 
        provider: result.provider || provider || "resend" });
      metrics.observeDuration("email_send_duration_ms", duration, {
        template,
        provider: result.provider || provider || "resend"
      });

      const targetProvider = result.provider || provider || "resend";
      const messageId = result.messageId || result.id || null;

      await history.log({
        to: Array.isArray(to) ? to : [to],
        template,
        provider: targetProvider,
        status: "sent",
        durationMs: duration,
        messageId,
        error: null,
        attempts: attempt,
        metadata: { deliveryId, userId: data?.userId, organizationId: data?.organizationId },
        maxAttempts: attempt
      });

      return { success: true, messageId };
    } catch (error) {
      const duration = Date.now() - startTime;
      const classified = classifyError(error);
      const maxAttempts = job.attemptsMade || 1;

      metrics.increment("emails_failed", 1, { template, provider: provider || "resend" });
      metrics.increment("emails_${classified.category}", 1, { template });

      const failureType = classified.retryable ? "retryable" : "permanent";
      metrics.increment(`emails_${failureType}_failure`, 1, { 
        template, 
        category: classified.category 
      });

      if (!classified.retryable) {
        await history.log({
          to: Array.isArray(to) ? to : [to],
          template,
          provider: provider || "resend",
          status: classified.category === "bounce" ? "bounced" : "rejected",
          durationMs: duration,
          messageId: null,
          error: classified.message || error.message,
          attempts: maxAttempts + 1,
          metadata: { deliveryId, userId: data?.userId, organizationId: data?.organizationId }
        });

        logger.logWarn("EmailNonRetryable", `${classified.category} for ${template}`, {
          error: classified.message,
          template,
          category: classified.category
        });

        return {
          success: false,
          error: classified.message,
          fatal: true,
          category: classified.category
        };
      }

      await history.log({
        to: Array.isArray(to) ? to : [to],
        template,
        provider: provider || "resend",
        status: "failed",
        durationMs: duration,
        messageId: null,
        error: error.message || String(error),
        attempts: maxAttempts + 1,
        metadata: { deliveryId, userId: data?.userId, organizationId: data?.organizationId }
      });

      logger.logError("EmailSendFailed", error, {
        jobId: job.id,
        article: attempt,
        template,
        to,
        durationMs: duration
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
        throw new Error("sendFn not configured");
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
      const targetProvider = result.provider || "twilio";

      metrics.increment("whatsapp_sent", 1, { template: job.data.template });
      metrics.observeDuration("whatsapp_send_duration_ms", duration, {
        template: job.data.template
      });

      await history.log({
        to: Array.isArray(job.data.to) ? job.data.to : [job.data.to],
        template: job.data.template,
        provider: targetProvider,
        status: "sent",
        durationMs: duration,
        messageId: result.messageId || null,
        error: null,
        attempts: (job.attemptsMade || 0) + 1,
        metadata: { userId: job.data.data?.userId }
      });

      return { success: true };
    } catch (error) {
      const duration = Date.now() - startTime;
      const classified = classifyError(error);

      metrics.increment("whatsapp_failed", 1, { template: job.data.template });

      if (!classified.retryable) {
        await history.log({
          to: Array.isArray(job.data.to) ? job.data.to : [job.data.to],
          template: job.data.template,
          provider: "twilio",
          status: "rejected",
          durationMs: duration,
          error: error.message || String(error),
          attempts: (job.attemptsMade || 0) + 1,
          metadata: { userId: job.data.data?.userId }
        });
        return { success: false, fatal: true };
      }

      logger.logError("WhatsAppSendFailed", error, {
        jobId: job.id,
        template: job.data.template
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
