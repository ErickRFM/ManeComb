const crypto = require("crypto");
const config = require("../config");
const validators = require("../core/validators");
const retry = require("../core/retry");
const queue = require("../queue");
const history = require("../history");
const metrics = require("../metrics");
const logger = require("../logger");
const { renderEmail } = require("../renderer");
const { getTemplateBuilder } = require("../templates");
const { sanitizeProviderError, classifyEmailError, safeDeliveryLog } = require("../security");
const health = require("../health");
const { createDeliveryResult } = require("./result");

class DeliveryEngine {
  constructor() {
    this.providerSendFn = null;
  }

  configure() {}

  setSendFunction(fn) {
    this.providerSendFn = fn;
  }

  buildJobId(input) {
    const digest = crypto.createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 24);
    const scope = input.tenantScope.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    const event = input.eventType.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    return `email-${scope}-${event}-${digest}`;
  }

  async claim(input) {
    const validation = validators.validateSendEmailInput(input);
    if (!validation.valid) throw new Error(validation.errors.join(", "));
    const target = input.recipient?.email || input.to;
    const claimed = await history.claim({
      ...input,
      requireDurable: config.getConfig().email.enabled &&
        !config.getConfig().email.dryRun &&
        config.getConfig().email.requireDurableHistory,
      recipient: { email: target },
      status: "created",
      provider: input.provider || config.getConfig().provider
    });
    if (claimed.created) metrics.increment("deliveries_created", 1, { template: input.template });
    else metrics.increment("duplicates_prevented", 1, { template: input.template });
    return claimed;
  }

  async processDelivery(input, deliveryId, attempts = 1) {
    const cfg = config.getConfig();
    const templateFn = getTemplateBuilder(input.template);
    if (!templateFn) throw new Error(`Template not found: ${input.template}`);
    const rendered = renderEmail(templateFn, input.data);

    if (!cfg.email.enabled) {
      await history.updateDelivery(deliveryId, { status: "skipped" });
      metrics.increment("deliveries_skipped", 1, { template: input.template });
      return createDeliveryResult({ status: "skipped", deliveryId });
    }
    if (cfg.email.dryRun) {
      await history.updateDelivery(deliveryId, { status: "dry_run" });
      metrics.increment("deliveries_dry_run", 1, { template: input.template });
      return createDeliveryResult({ status: "dry_run", deliveryId });
    }
    if (!this.providerSendFn) throw new Error("Provider send function not configured");

    await history.updateDelivery(deliveryId, { status: "processing", attempts });
    metrics.increment("provider_attempts", 1, { template: input.template, provider: input.provider });
    const startedAt = Date.now();
    let result;
    try {
      result = await this.providerSendFn({
        ...input,
        to: input.recipient?.email || input.to,
        subject: input.subject || rendered.subject,
        html: rendered.html,
        text: rendered.text
      });
      if (!result.success) throw new Error(result.error || "Provider send failed");
    } catch (error) {
      const classified = classifyEmailError(error, input.provider);
      health.setLastOperationalError({
        category: classified.category,
        code: classified.statusCode ? String(classified.statusCode) : classified.category,
        message: sanitizeProviderError(error)
      });
      await history.updateDelivery(deliveryId, {
        status: "failed",
        attempts,
        errorCategory: classified.category,
        errorCode: classified.statusCode ? String(classified.statusCode) : classified.category,
        errorMessage: sanitizeProviderError(error)
      });
      logger.logError("EmailSendFailed", new Error(sanitizeProviderError(error)), safeDeliveryLog({
        ...input, deliveryId, status: "failed", error
      }));
      const normalized = new Error(sanitizeProviderError(error));
      normalized.retryable = classified.retryable;
      normalized.category = classified.category;
      throw normalized;
    }
    const durationMs = Date.now() - startedAt;
    await history.updateDelivery(deliveryId, {
      status: "sent",
      provider: result.provider || input.provider,
      providerMessageId: result.messageId || result.id || null,
      durationMs,
      attempts
    }).catch((error) => {
      logger.logError("EmailHistoryUpdateFailed", new Error(sanitizeProviderError(error)), {
        ...safeDeliveryLog({ ...input, deliveryId, status: "sent" }),
        error
      });
    });
    metrics.increment("deliveries_sent", 1, { template: input.template, provider: input.provider });
    health.setLastOperationalError(null);
    metrics.observeDuration("email_send_duration_ms", durationMs, { template: input.template });
    logger.logEvent("EmailSent", safeDeliveryLog({ ...input, deliveryId, status: "sent" }));
    return createDeliveryResult({
      status: "sent",
      deliveryId,
      messageId: result.messageId || result.id || null
    });
  }

  async sendDirect(input) {
    const claimed = await this.claim(input);
    if (!claimed.created) {
      return createDeliveryResult({
        duplicate: true,
        status: claimed.delivery.status,
        deliveryId: claimed.delivery.deliveryId
      });
    }
    const maxAttempts = retry.getMaxRetries(validators.normalizePriority(input.priority)) + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.processDelivery(input, claimed.delivery.deliveryId, attempt);
      } catch (error) {
        if (!error.retryable || attempt === maxAttempts) {
          metrics.increment("deliveries_failed", 1, { template: input.template, provider: input.provider });
          return createDeliveryResult({
            status: "failed",
            deliveryId: claimed.delivery.deliveryId,
            error: sanitizeProviderError(error),
            errorCategory: error.category
          });
        }
        metrics.increment("provider_retries", 1, { template: input.template, category: error.category });
      }
    }
    return createDeliveryResult({
      status: "failed",
      deliveryId: claimed.delivery.deliveryId
    });
  }

  async sendViaQueue(input) {
    const claimed = await this.claim(input);
    if (!claimed.created) {
      return createDeliveryResult({
        duplicate: true,
        status: claimed.delivery.status,
        deliveryId: claimed.delivery.deliveryId
      });
    }
    const cfg = config.getConfig();
    if (!cfg.email.enabled || cfg.email.dryRun) {
      return this.processDelivery(input, claimed.delivery.deliveryId, 0);
    }
    const resolvedPriority = validators.normalizePriority(input.priority);
    const jobId = this.buildJobId(input);
    try {
      const job = await queue.getQueue("emails").add("send-email", {
        ...input,
        deliveryId: claimed.delivery.deliveryId
      }, { ...retry.getJobOptions(resolvedPriority), priority: resolvedPriority, jobId });
      await history.updateDelivery(claimed.delivery.deliveryId, { status: "queued" });
      metrics.increment("deliveries_queued", 1, { template: input.template });
      return createDeliveryResult({
        status: "queued",
        deliveryId: claimed.delivery.deliveryId,
        jobId: job.id
      });
    } catch (error) {
      if (cfg.email.requireDurableQueue) {
        await history.updateDelivery(claimed.delivery.deliveryId, {
          status: "failed", errorCategory: "queue", errorCode: "QUEUE_UNAVAILABLE", errorMessage: error
        });
        return createDeliveryResult({
          status: "failed",
          deliveryId: claimed.delivery.deliveryId,
          error: "Queue unavailable",
          errorCategory: "queue"
        });
      }
      return this.processDelivery(input, claimed.delivery.deliveryId, 1);
    }
  }

  async processQueued(job) {
    const attempts = (job.attemptsMade || 0) + 1;
    try {
      return await this.processDelivery(job.data, job.data.deliveryId, attempts);
    } catch (error) {
      const maxAttempts = Number(job.opts?.attempts || 1);
      if (job.local || error.retryable === false || attempts >= maxAttempts) {
        metrics.increment("deliveries_failed", 1, { template: job.data.template, provider: job.data.provider });
      }
      throw error;
    }
  }

  async queueOrDirect(input) {
    return validators.normalizePriority(input.priority) >= 10
      ? this.sendDirect(input)
      : this.sendViaQueue(input);
  }
}

module.exports = new DeliveryEngine();
