const errors = require("../errors");
const timeout = require("../timeout");
const rateLimiter = require("../rate-limit");
const metrics = require("../metrics");
const logger = require("../logger");
const history = require("../history");
const events = require("../events");
const retry = require("../core/retry");
const config = require("../config");

class DeliveryPipeline {
  constructor() {
    this.stages = [];
  }

  use(stage) {
    this.stages.push(stage);
    return this;
  }

  async execute(context) {
    let current = { ...context };
    for (const stage of this.stages) {
      try {
        current = await stage.execute(current);
      } catch (error) {
        current.error = error;
        current.status = "failed";
        break;
      }
    }
    return current;
  }
}

class ValidateStage {
  async execute(ctx) {
    const validators = require("../core/validators");
    const validation = validators.validateSendEmailInput({
      to: ctx.to,
      template: ctx.template,
      eventType: ctx.eventType,
      idempotencyKey: ctx.idempotencyKey,
      tenantScope: ctx.tenantScope,
      data: ctx.data
    });
    if (!validation.valid) {
      throw new errors.InvalidAddressError(validation.errors.join(", "));
    }
    ctx.status = "validated";
    return ctx;
  }
}

class ResolveTemplateStage {
  async execute(ctx) {
    const { getTemplateBuilder } = require("../templates");
    const { renderTemplate, extractSubject } = require("../renderer");
    const templateFn = getTemplateBuilder(ctx.template);
    if (!templateFn) {
      throw new Error(`Template not found: ${ctx.template}`);
    }
    ctx.subject = ctx.subject || extractSubject(ctx.data);
    ctx.html = renderTemplate(templateFn, ctx.data);
    ctx.status = "template_resolved";
    return ctx;
  }
}

class RateLimitStage {
  async execute(ctx) {
    const limiterName = `send:${ctx.provider || "default"}`;
    if (!rateLimiter.limiters.has(limiterName)) {
      rateLimiter.configure(limiterName, {
        maxTokens: ctx.rateLimitTokens || 10,
        refillRate: ctx.rateLimitRefillRate || 1,
        refillIntervalMs: ctx.rateLimitInterval || 1000
      });
    }
    await rateLimiter.waitForToken(limiterName);
    ctx.status = "rate_limited";
    return ctx;
  }
}

class SendStage {
  async execute(ctx) {
    const sendFn = ctx.sendFn;
    if (!sendFn) throw new Error("sendFn not configured in context");

    const timeoutMs = timeout.getTimeoutMs(ctx.priority || 0, 30000);

    const result = await timeout.withTimeout(
      () => sendFn(ctx),
      timeoutMs,
      `send:${ctx.provider || "unknown"}`
    );

    ctx.result = result;
    ctx.status = result.success ? "sent" : "failed";
    ctx.messageId = result.id || result.messageId || null;
    ctx.durationMs = result.durationMs || 0;

    if (!result.success) {
      ctx.error = new errors.ProviderError(result.error || "Send failed", {
        provider: ctx.provider
      });
      ctx.classifiedError = errors.classifyError(ctx.error, ctx.provider);
    }

    return ctx;
  }
}

class MetricsStage {
  async execute(ctx) {
    const duration = ctx.durationMs || 0;
    const template = ctx.template || "unknown";
    const provider = ctx.provider || "unknown";

    if (ctx.status === "failed") {
      metrics.increment("emails_failed", 1, { template, provider });
    } else {
      metrics.increment("emails_sent", 1, { template, provider });
      metrics.observeDuration("email_send_duration_ms", duration, { template, provider });
    }

    return ctx;
  }
}

class HistoryStage {
  async execute(ctx) {
    const to = Array.isArray(ctx.to) ? ctx.to : [ctx.to];
    const attempts = ctx.attempts || 1;

    if (ctx.historyId) {
      await history.updateStatus(ctx.historyId, {
        status: ctx.status,
        durationMs: ctx.durationMs,
        messageId: ctx.messageId,
        error: ctx.error ? ctx.error.message || String(ctx.error) : null,
        attempts
      });
    } else {
      const doc = await history.log({
        to,
        template: ctx.template,
        provider: ctx.provider || config.getConfig().provider,
        status: ctx.status,
        priority: ctx.priority || 1,
        subject: ctx.subject || "",
        messageId: ctx.messageId || null,
        durationMs: ctx.durationMs || null,
        attempts,
        maxAttempts: ctx.maxAttempts || 3,
        error: ctx.error ? ctx.error.message || String(ctx.error) : null,
        metadata: {
          deliveryId: ctx.deliveryId || null,
          userId: ctx.data?.userId || null,
          organizationId: ctx.data?.organizationId || null
        }
      });
      ctx.historyId = doc._id;
    }

    return ctx;
  }
}

class EventsStage {
  async execute(ctx) {
    const eventName = ctx.status === "failed" ? "communication:email_failed" : "communication:email_sent";
    events.emit(eventName, {
      template: ctx.template,
      provider: ctx.provider,
      to: Array.isArray(ctx.to) ? ctx.to : [ctx.to],
      error: ctx.error?.message || null,
      messageId: ctx.messageId,
      durationMs: ctx.durationMs
    });
    return ctx;
  }
}

class ErrorClassificationStage {
  async execute(ctx) {
    if (ctx.error) {
      ctx.classifiedError = errors.classifyError(ctx.error, ctx.provider);
    }
    return ctx;
  }
}

module.exports = {
  DeliveryPipeline,
  ValidateStage,
  ResolveTemplateStage,
  RateLimitStage,
  SendStage,
  MetricsStage,
  HistoryStage,
  EventsStage,
  ErrorClassificationStage
};
