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
const { PROVIDER, TEMPLATE_PRIORITY, PRIORITY, QUEUE_NAMES } = require("./core/types");

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
    serverToken: conf.providerConfig.serverToken
  };

  const providerValidation = validators.validateProviderConfig(conf.provider, providerCfg);
  if (!providerValidation.valid) {
    logger.logWarn("ProviderConfigInvalid",
      `Proveedor ${conf.provider} no configurado: ${providerValidation.errors.join(", ")}. Comunicación deshabilitada.`,
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
    throw new Error("Módulo de comunicaciones no configurado");
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
    const result = await sendDirect({ to, template, data: enrichedData, from, subject });
    return result;
  }

  const q = queue.getQueue(QUEUE_NAMES.EMAILS);
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
        provider: config.getConfig().provider,
        from
      },
      {
        ...jobOptions,
        priority: resolvedPriority
      }
    );
  } catch (error) {
    logger.logWarn("QueueAddFailed", `No se pudo encolar correo (${template}), enviando directo`, {
      template,
      provider: config.getConfig().provider,
      error: error.message
    });
    const result = await sendDirect({ to, template, data: enrichedData, from, subject });
    return result;
  }

  await history.log({
    to: Array.isArray(to) ? to : [to],
    template,
    provider: config.getConfig().provider,
    status: "queued",
    priority: resolvedPriority,
    subject: subject || "",
    metadata: { userId: data?.userId, organizationId: data?.organizationId }
  });

  metrics.increment("emails_enqueued", 1, { template, provider: config.getConfig().provider });

  return {
    queued: true,
    jobId: job.id,
    template,
    provider: config.getConfig().provider
  };
}

async function sendDirect({ to, template, data, from, subject }) {
  const startTime = Date.now();

  metrics.increment("emails_attempted", 1, { template, provider: config.getConfig().provider });

  try {
    const resolvedSubject = subject || extractSubject(data);
    const templateFn = getTemplateBuilder(template);
    if (!templateFn) {
      throw new Error(`Template not found: ${template}`);
    }
    const html = renderTemplate(templateFn, data);

    const result = await provider.send({
      to,
      from: from || config.getConfig().defaultFrom,
      subject: resolvedSubject,
      html
    });

    const duration = Date.now() - startTime;

    if (!result.success) {
      metrics.increment("emails_failed", 1, { template, provider: config.getConfig().provider });
      logger.logError("EmailSendFailed", new Error(result.error), {
        template,
        provider: config.getConfig().provider,
        to: Array.isArray(to) ? to.join(",") : to,
        durationMs: duration
      });
      events.emit("communication:email_failed", {
        template,
        provider: config.getConfig().provider,
        error: result.error,
        to: Array.isArray(to) ? to : [to]
      });
      return {
        success: false,
        error: result.error,
        provider: config.getConfig().provider,
        durationMs: duration
      };
    }

    metrics.increment("emails_sent", 1, { template, provider: config.getConfig().provider });
    metrics.observeDuration("email_send_duration_ms", duration, { template, provider: config.getConfig().provider });

    logger.logEvent("EmailSent", {
      status: "success",
      template,
      provider: config.getConfig().provider,
      to: Array.isArray(to) ? to.join(",") : to,
      durationMs: duration
    });

    events.emit("communication:email_sent", {
      template,
      provider: config.getConfig().provider,
      to: Array.isArray(to) ? to : [to]
    });

    return {
      success: true,
      provider: config.getConfig().provider,
      messageId: result?.id || null,
      durationMs: duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    metrics.increment("emails_failed", 1, { template, provider: config.getConfig().provider });

    logger.logError("EmailSendFailed", error, {
      template,
      provider: config.getConfig().provider,
      to: Array.isArray(to) ? to.join(",") : to,
      durationMs: duration
    });

    events.emit("communication:email_failed", {
      template,
      provider: config.getConfig().provider,
      error: error.message,
      to: Array.isArray(to) ? to : [to]
    });

    return {
      success: false,
      error: error.message,
      provider: config.getConfig().provider,
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
  health
};
