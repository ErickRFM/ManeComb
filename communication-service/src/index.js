const config = require("./config");
const types = require("./core/types");
const validators = require("./core/validators");
const retry = require("./core/retry");
const { createProvider } = require("./providers");
const { getTemplateBuilder, hasTemplate, getTemplateNames } = require("./templates");
const { renderTemplate, extractSubject } = require("./renderer");
const queue = require("./queue");
const { setSendFunction, createEmailWorker, createWhatsAppWorker } = require("./workers");
const history = require("./history");
const metrics = require("./metrics");
const events = require("./events");
const logger = require("./logger");
const health = require("./health");
const connectionManager = require("./connection");
const rateLimiter = require("./rate-limit");
const timeout = require("./timeout");
const errors = require("./errors");
const deliveryEngine = require("./delivery/engine");
const { PRIORITY, TEMPLATE_PRIORITY, QUEUE_NAMES } = require("./core/types");

let provider = null;

function configure(cfg) {
  config.configure(cfg);

  if (cfg.socketIO) {
    events.setSocketIO(cfg.socketIO);
  }

  const conf = config.getConfig();

  const providerCfg = {
    apiKey: conf.providerConfig.apiKey,
    fromEmail: conf.providerConfig.fromEmail || conf.defaultFrom,
    fromName: conf.brandName,
    host: conf.providerConfig.host,
    port: conf.providerConfig.port,
    secure: conf.providerConfig.secure,
    auth: conf.providerConfig.auth,
    region: conf.providerConfig.region,
    accessKeyId: conf.providerConfig.accessKeyId,
    secretAccessKey: conf.providerConfig.secretAccessKey,
    domain: conf.providerConfig.domain,
    serverToken: conf.providerConfig.serverToken,
    replyTo: conf.providerConfig.replyTo
  };

  const providerValidation = validators.validateProviderConfig(conf.provider, providerCfg);
  if (!providerValidation.valid) {
    logger.logWarn("ProviderConfigInvalid",
      `Provider ${conf.provider} not configured: ${providerValidation.errors.join(", ")}. Communications disabled.`,
      { provider: conf.provider, errors: providerValidation.errors }
    );
    provider = null;
    config.setConfigured(true);
  } else {
    provider = createProvider(conf.provider, providerCfg);
  }

  queue.configure({
    enabled: conf.queue.enabled,
    redisUrl: conf.queue.redisUrl
  });

  connectionManager.configure({
    maxConnections: conf.delivery?.maxConnections || 10,
    idleTimeoutMs: conf.delivery?.connectionIdleTimeoutMs || 30000
  });

  const deliveryCfg = conf.delivery || {};
  if (deliveryCfg.rateLimitTokens) {
    rateLimiter.configure("send:default", {
      maxTokens: deliveryCfg.rateLimitTokens || 10,
      refillRate: deliveryCfg.rateLimitRefillRate || 1,
      refillIntervalMs: deliveryCfg.rateLimitIntervalMs || 1000
    });
  }

  deliveryEngine.configure(conf.delivery);
  deliveryEngine.setSendFunction(sendDirect);
  setSendFunction(sendDirect);
  createEmailWorker();
}

function isConfigured() {
  return config.isConfigured() && provider !== null;
}

function getReadiness() {
  return health.getReadiness();
}

async function sendEmail({ to, template, data, priority, from, subject }) {
  if (!isConfigured()) {
    throw new Error("Communication module not configured");
  }

  const resolvedPriority = priority != null ? validators.normalizePriority(priority) : (TEMPLATE_PRIORITY[template] || PRIORITY.NORMAL);

  const enrichedData = {
    ...data,
    _template: template,
    supportEmail: data?.supportEmail || config.getConfig().supportEmail,
    docsUrl: data?.docsUrl || config.getConfig().docsUrl,
    brandName: config.getConfig().brandName
  };

  if (resolvedPriority >= PRIORITY.CRITICAL) {
    return deliveryEngine.sendDirect({
      to,
      template,
      data: enrichedData,
      priority: resolvedPriority,
      from,
      subject
    });
  }

  return deliveryEngine.sendViaQueue({
    to,
    template,
    data: enrichedData,
    priority: resolvedPriority,
    from,
    subject
  });
}

async function sendDirect({ to, template, data, from, subject, provider: providerOpt }) {
  const startTime = Date.now();
  const targetProvider = providerOpt || config.getConfig().provider;

  metrics.increment("emails_attempted", 1, { template, provider: targetProvider });

  try {
    const resolvedSubject = subject || extractSubject(data);
    const templateFn = getTemplateBuilder(template);
    if (!templateFn) {
      throw new Error(`Template not found: ${template}`);
    }
    const html = renderTemplate(templateFn, data);

    const sendProvider = provider || createProvider(targetProvider, config.getConfig().providerConfig);
    const sendWithTimeout = () =>
      timeout.withTimeout(
        () => sendProvider.send({
          to,
          from: from || config.getConfig().defaultFrom,
          subject: resolvedSubject,
          html
        }),
        timeout.getTimeoutMs(0, 30000),
        `send:${targetProvider}`
      );

    const result = await sendWithTimeout();
    const duration = Date.now() - startTime;

    if (!result.success) {
      const classified = errors.classifyError(new Error(result.error), targetProvider);
      metrics.increment("emails_failed", 1, { template, provider: targetProvider });
      logger.logError("EmailSendFailed", new Error(result.error), {
        template,
        provider: targetProvider,
        to: Array.isArray(to) ? to.join(",") : to,
        durationMs: duration,
        category: classified.category
      });
      events.emit("communication:email_failed", {
        template,
        provider: targetProvider,
        error: result.error,
        to: Array.isArray(to) ? to : [to],
        category: classified.category
      });
      return {
        success: false,
        error: result.error,
        errorCategory: classified.category,
        provider: targetProvider,
        durationMs: duration
      };
    }

    metrics.increment("emails_sent", 1, { template, provider: targetProvider });
    metrics.observeDuration("email_send_duration_ms", duration, { template, provider: targetProvider });

    logger.logEvent("EmailSent", {
      status: "success",
      template,
      provider: targetProvider,
      to: Array.isArray(to) ? to.join(",") : to,
      durationMs: duration
    });

    events.emit("communication:email_sent", {
      template,
      provider: targetProvider,
      to: Array.isArray(to) ? to : [to]
    });

    return {
      success: true,
      provider: targetProvider,
      messageId: result?.id || null,
      durationMs: duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const classified = errors.classifyError(error, targetProvider);

    metrics.increment("emails_failed", 1, { template, provider: targetProvider });

    logger.logError("EmailSendFailed", error, {
      template,
      provider: targetProvider,
      to: Array.isArray(to) ? to.join(",") : to,
      durationMs: duration,
      category: classified.category
    });

    events.emit("communication:email_failed", {
      template,
      provider: targetProvider,
      error: error.message,
      to: Array.isArray(to) ? to : [to],
      category: classified.category
    });

    return {
      success: false,
      error: error.message,
      errorCategory: classified.category,
      provider: targetProvider,
      durationMs: duration
    };
  }
}

function getProvider() {
  return provider;
}

function getProviderName() {
  return config.getConfig().provider;
}

module.exports = {
  configure,
  isConfigured,
  getReadiness,
  sendEmail,
  sendDirect,
  getProvider,
  getProviderName,
  createProvider,
  getTemplateBuilder,
  hasTemplate,
  getTemplateNames,
  renderTemplate,
  extractSubject,
  types,
  validators,
  history,
  metrics,
  events,
  retry,
  logger,
  health,
  errors,
  connectionManager,
  rateLimiter,
  timeout,
  deliveryEngine
};
