const { DeliveryPipeline, ValidateStage, ResolveTemplateStage, RateLimitStage, SendStage, MetricsStage, HistoryStage, EventsStage, ErrorClassificationStage } = require("./pipeline");
const config = require("../config");
const validators = require("../core/validators");
const retry = require("../core/retry");
const { PRIORITY } = require("../core/types");
const queue = require("../queue");
const history = require("../history");
const metrics = require("../metrics");
const logger = require("../logger");

class DeliveryEngine {
  constructor() {
    this.pipeline = null;
    this.sendFn = null;
  }

  configure(cfg) {
    this.pipeline = new DeliveryPipeline();
    this.pipeline
      .use(new ValidateStage())
      .use(new ResolveTemplateStage())
      .use(new RateLimitStage())
      .use(new SendStage())
      .use(new ErrorClassificationStage())
      .use(new MetricsStage())
      .use(new HistoryStage())
      .use(new EventsStage());
  }

  setSendFunction(fn) {
    this.sendFn = fn;
  }

  async sendDirect({ to, template, data, priority, from, subject, provider, attempts }) {
    if (!this.sendFn) {
      throw new Error("sendFn not configured in DeliveryEngine");
    }

    const deliveryId = `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const ctx = {
      to,
      template,
      data: {
        ...data,
        _template: template,
        supportEmail: data?.supportEmail || config.getConfig().supportEmail,
        docsUrl: data?.docsUrl || config.getConfig().docsUrl,
        brandName: config.getConfig().brandName
      },
      priority: priority != null ? validators.normalizePriority(priority) : 1,
      from,
      subject,
      provider: provider || config.getConfig().provider,
      sendFn: this.sendFn,
      attempts: attempts || 1,
      maxAttempts: retry.getMaxRetries(priority != null ? validators.normalizePriority(priority) : 1) + 1,
      deliveryId,
      rateLimitTokens: 10,
      rateLimitRefillRate: 1,
      rateLimitInterval: 1000
    };

    const result = await this.pipeline.execute(ctx);

    if (!result.success && result.success !== undefined && result.status === "failed") {
      const classifiedError = result.classifiedError || result.error;
      if (classifiedError.retryable && (result.attempts || 1) < (result.maxAttempts || 3)) {
        logger.logWarn("DeliveryRetry", `Retrying ${template} (attempt ${result.attempts + 1}/${result.maxAttempts})`, {
          template,
          error: classifiedError.message
        });
      }
    }

    return {
      success: result.status !== "failed",
      messageId: result.messageId || null,
      provider: result.provider || config.getConfig().provider,
      durationMs: result.durationMs || 0,
      error: result.classifiedError?.message || result.error?.message || null,
      errorCategory: result.classifiedError?.category || null,
      historyId: result.historyId || null,
      status: result.status
    };
  }

  async sendViaQueue({ to, template, data, priority, from, subject, provider }) {
    const resolvedPriority = priority != null ? validators.normalizePriority(priority) : 1;
    const deliveryId = `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const enrichedData = {
      ...data,
      _template: template,
      supportEmail: data?.supportEmail || config.getConfig().supportEmail,
      docsUrl: data?.docsUrl || config.getConfig().docsUrl,
      brandName: config.getConfig().brandName
    };

    const q = queue.getQueue("emails");
    const jobOptions = retry.getJobOptions(resolvedPriority);

    let job;
    try {
      job = await q.add(
        "send-email",
        {
          to,
          template,
          data: enrichedData,
          priority: resolvedPriority,
          provider: provider || config.getConfig().provider,
          from,
          deliveryId
        },
        { ...jobOptions, priority: resolvedPriority }
      );
    } catch (error) {
      logger.logWarn("QueueAddFailed", `Queue unavailable, sending direct: ${template}`, {
        template,
        error: error.message
      });
      return this.sendDirect({ to, template, data: enrichedData, from, subject, provider });
    }

    await history.log({
      to: Array.isArray(to) ? to : [to],
      template,
      provider: provider || config.getConfig().provider,
      status: "queued",
      priority: resolvedPriority,
      subject: subject || "",
      metadata: { deliveryId, userId: data?.userId, organizationId: data?.organizationId }
    });

    metrics.increment("emails_enqueued", 1, {
      template,
      provider: provider || config.getConfig().provider
    });

    return {
      queued: true,
      deliveryId,
      jobId: job.id,
      template,
      provider: provider || config.getConfig().provider,
      priority: resolvedPriority
    };
  }

  async queueOrDirect({ to, template, data, priority, from, subject, provider }) {
    const resolvedPriority = priority != null ? validators.normalizePriority(priority) : 1;

    if (resolvedPriority >= PRIORITY.CRITICAL) {
      return this.sendDirect({ to, template, data, priority: resolvedPriority, from, subject, provider });
    }

    return this.sendViaQueue({ to, template, data, priority: resolvedPriority, from, subject, provider });
  }
}

const deliveryEngine = new DeliveryEngine();

module.exports = deliveryEngine;
