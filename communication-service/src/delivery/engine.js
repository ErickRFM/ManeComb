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

const OUTBOX_STALE_MS = 120000;
const OUTBOX_LEASE_MS = 60000;
const OUTBOX_REAPER_BATCH = 25;

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

  async enqueueDelivery(input, deliveryId, options = {}) {
    const resolvedPriority = validators.normalizePriority(input.priority);
    const jobId = this.buildJobId(input);
    const job = await queue.getQueue("emails").add("send-email", {
      ...input,
      deliveryId
    }, { ...retry.getJobOptions(resolvedPriority), priority: resolvedPriority, jobId });

    if (options.recovery) {
      await history.releaseRecoveryLease(deliveryId, {
        status: "queued",
        errorCategory: null,
        errorCode: null,
        errorMessage: null
      }, { now: options.recoveryNow });
      metrics.increment("outbox_recovered", 1, { template: input.template });
    } else {
      await history.updateDelivery(deliveryId, {
        status: "queued",
        errorCategory: null,
        errorCode: null,
        errorMessage: null
      });
      metrics.increment("deliveries_queued", 1, { template: input.template });
    }

    return job;
  }

  async recoverDelivery(delivery, options = {}) {
    const input = delivery?.outboxPayload;
    if (!delivery?.deliveryId || !input) return null;
    return this.enqueueDelivery(input, delivery.deliveryId, {
      recovery: true,
      recoveryNow: options.recoveryNow
    });
  }

  async reconcileOutbox(options = {}) {
    const historyReadiness = history.getReadiness();
    const queueReadiness = queue.getReadiness();
    if (!historyReadiness.durable || !queueReadiness.enabled) {
      return { scanned: 0, recovered: 0, failed: 0, skipped: true };
    }

    const staleMs = Math.max(1000, Number(options.staleMs) || OUTBOX_STALE_MS);
    const leaseMs = Math.max(1000, Number(options.leaseMs) || OUTBOX_LEASE_MS);
    const limit = Math.min(Math.max(1, Number(options.limit) || OUTBOX_REAPER_BATCH), 100);
    const now = options.now instanceof Date ? options.now : new Date();
    const staleBefore = new Date(now.getTime() - staleMs);
    let scanned = 0;
    let recovered = 0;
    let failed = 0;

    for (let index = 0; index < limit; index += 1) {
      const delivery = await history.claimRecoverableDelivery({
        now,
        staleBefore,
        leaseMs
      });
      if (!delivery) break;
      scanned += 1;

      try {
        await this.recoverDelivery(delivery, { recoveryNow: now });
        recovered += 1;
      } catch (error) {
        failed += 1;
        await history.releaseRecoveryLease(delivery.deliveryId, {
          errorCategory: "queue",
          errorCode: "OUTBOX_REQUEUE_FAILED",
          errorMessage: error
        }, { now }).catch(() => null);
        logger.logError("EmailOutboxRecoveryFailed", new Error(sanitizeProviderError(error)), {
          ...safeDeliveryLog({
            ...(delivery.outboxPayload || {}),
            deliveryId: delivery.deliveryId,
            status: delivery.status
          }),
          error
        });
      }
    }

    return { scanned, recovered, failed, skipped: false };
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
        text: rendered.text,
        // The durable Mongo delivery is the end-to-end provider identity. BullMQ
        // retries and direct retries must never mint a new provider key.
        providerIdempotencyKey: deliveryId
      });
      if (!result.success) throw new Error(result.error || "Provider send failed");
    } catch (error) {
      const classified = classifyEmailError(error, input.provider);
      health.setLastOperationalError({
        category: classified.category,
        code: classified.statusCode ? String(classified.statusCode) : classified.category,
        message: sanitizeProviderError(error)
      });
      // `failed` is not automatically terminal: BullMQ/direct retry may still
      // execute the same durable delivery. The outbox remains until the caller
      // explicitly finalizes exhausted/non-retryable delivery.
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
          await history.finalizeDelivery(claimed.delivery.deliveryId, {
            status: "failed",
            attempts: attempt,
            errorCategory: error.category,
            errorMessage: error
          });
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
    await history.finalizeDelivery(claimed.delivery.deliveryId, { status: "failed" });
    return createDeliveryResult({
      status: "failed",
      deliveryId: claimed.delivery.deliveryId
    });
  }

  async sendViaQueue(input) {
    const claimed = await this.claim(input);
    if (!claimed.created) {
      // A repeated domain event may be the only signal that Redis lost a job.
      // If Mongo still has an executable created/failed outbox entry, repair it
      // immediately using the deterministic BullMQ jobId. Queued/processing
      // entries are handled by the stale reaper to avoid status churn.
      if (claimed.durable && ["created", "failed"].includes(claimed.delivery.status)) {
        const pending = await history.getOutboxByDeliveryId(claimed.delivery.deliveryId);
        if (pending?.outboxPayload) {
          try {
            await this.enqueueDelivery(pending.outboxPayload, pending.deliveryId);
          } catch {
            // The durable outbox is still authoritative. Reaper will retry.
          }
        }
      }
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
    try {
      const job = await this.enqueueDelivery(input, claimed.delivery.deliveryId);
      return createDeliveryResult({
        status: "queued",
        deliveryId: claimed.delivery.deliveryId,
        jobId: job.id
      });
    } catch (error) {
      if (claimed.durable) {
        // Mongo has accepted durable executable work. Redis availability no
        // longer converts that accepted delivery into a terminal failure.
        await history.updateDelivery(claimed.delivery.deliveryId, {
          status: "created",
          errorCategory: "queue",
          errorCode: "QUEUE_UNAVAILABLE",
          errorMessage: error
        });
        return createDeliveryResult({
          status: "created",
          deliveryId: claimed.delivery.deliveryId,
          recoverable: true,
          error: "Queue unavailable",
          errorCategory: "queue"
        });
      }
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
        await history.finalizeDelivery(job.data.deliveryId, {
          status: "failed",
          attempts,
          errorCategory: error.category,
          errorMessage: error
        });
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
