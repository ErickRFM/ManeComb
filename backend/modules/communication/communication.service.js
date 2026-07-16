const { validateSendEmailInput, normalizePriority, validateProviderConfig } = require("./communication.validators");
const { getTemplateBuilder } = require("./communication.templates");
const { renderTemplate, extractSubject } = require("./communication.renderer");
const { createProvider } = require("./communication.provider");
const { getQueue, configure: configureQueue } = require("./communication.queue");
const { setSendFunction, createEmailWorker } = require("./communication.jobs");
const history = require("./communication.history");
const metrics = require("./communication.metrics");
const logger = require("./communication.logger");
const events = require("./communication.events");
const retry = require("./communication.retry");
const { PRIORITY, TEMPLATE_PRIORITY, QUEUE_NAMES, PROVIDER, CHANNEL } = require("./communication.types");

let provider = null;
let providerName = null;
let configured = false;
let config = {};

function configure(cfg) {
  config = {
    provider: cfg.provider || PROVIDER.RESEND,
    providerConfig: cfg.providerConfig || {},
    queue: {
      enabled: cfg.queue?.enabled || false,
      redisUrl: cfg.queue?.redisUrl || ""
    },
    socketIO: cfg.socketIO || null,
    defaultFrom: cfg.defaultFrom || "",
    supportEmail: cfg.supportEmail || "",
    docsUrl: cfg.docsUrl || "",
    brandName: cfg.brandName || "ManeComb",
    legalName: cfg.legalName || "ManeComb"
  };

  if (config.socketIO) {
    events.setSocketIO(config.socketIO);
  }

  const providerCfg = {
    apiKey: config.providerConfig.apiKey,
    fromEmail: config.providerConfig.fromEmail || config.defaultFrom,
    fromName: config.brandName,
    host: config.providerConfig.host,
    port: config.providerConfig.port,
    secure: config.providerConfig.secure,
    auth: config.providerConfig.auth,
    region: config.providerConfig.region,
    accessKeyId: config.providerConfig.accessKeyId,
    secretAccessKey: config.providerConfig.secretAccessKey,
    domain: config.providerConfig.domain,
    serverToken: config.providerConfig.serverToken
  };

  const providerValidation = validateProviderConfig(config.provider, providerCfg);
  if (!providerValidation.valid) {
    logger.logWarn("ProviderConfigInvalid", `Proveedor ${config.provider} no configurado: ${providerValidation.errors.join(", ")}. Comunicación deshabilitada.`, {
      provider: config.provider,
      errors: providerValidation.errors
    });
    provider = null;
    providerName = null;
  } else {
    provider = createProvider(config.provider, providerCfg);
    providerName = config.provider;
  }

  configureQueue({
    enabled: config.queue.enabled,
    redisUrl: config.queue.redisUrl
  });

  setSendFunction(sendDirect);

  createEmailWorker();

  configured = true;
}

function isConfigured() {
  return configured && provider !== null;
}

function getReadiness() {
  return {
    configured,
    provider: providerName,
    ready: isConfigured(),
    queue: require("./communication.queue").getReadiness(),
    metrics: metrics.getSnapshot()
  };
}

async function sendEmail({ to, template, data, priority, from, subject }) {
  if (!isConfigured()) {
    throw new Error("Módulo de comunicaciones no configurado");
  }

  const resolvedPriority = priority != null ? normalizePriority(priority) : (TEMPLATE_PRIORITY[template] || PRIORITY.NORMAL);

  const enrichedData = {
    ...data,
    _template: template,
    supportEmail: data?.supportEmail || config.supportEmail,
    docsUrl: data?.docsUrl || config.docsUrl,
    brandName: config.brandName
  };

  if (resolvedPriority >= PRIORITY.CRITICAL) {
    const result = await sendDirect({ to, template, data: enrichedData, from, subject });
    return result;
  }

  const queue = getQueue(QUEUE_NAMES.EMAILS);
  const jobOptions = retry.getJobOptions(resolvedPriority);

  let job;
  try {
    job = await queue.add(
      "send-email",
      {
        to,
        template,
        data: enrichedData,
        priority: resolvedPriority,
        provider: providerName,
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
      provider: providerName,
      error: error.message
    });
    const result = await sendDirect({ to, template, data: enrichedData, from, subject });
    return result;
  }

  await history.log({
    to: Array.isArray(to) ? to : [to],
    template,
    provider: providerName,
    status: "queued",
    priority: resolvedPriority,
    subject: subject || "",
    metadata: { userId: data?.userId, organizationId: data?.organizationId }
  });

  metrics.increment("emails_enqueued", 1, { template, provider: providerName });

  return {
    queued: true,
    jobId: job.id,
    template,
    provider: providerName
  };
}

async function sendDirect({ to, template, data, from, subject }) {
  const startTime = Date.now();

  metrics.increment("emails_attempted", 1, { template, provider: providerName });

  try {
    const resolvedSubject = subject || extractSubject(data);
    const templateFn = getTemplateBuilder(template);
    if (!templateFn) {
      throw new Error(`Template not found: ${template}`);
    }
    const html = renderTemplate(templateFn, data);

    const result = await provider.send({
      to,
      from: from || config.defaultFrom,
      subject: resolvedSubject,
      html
    });

    const duration = Date.now() - startTime;

    if (!result.success) {
      metrics.increment("emails_failed", 1, { template, provider: providerName });
      logger.logError("EmailSendFailed", new Error(result.error), {
        template,
        provider: providerName,
        to: Array.isArray(to) ? to.join(",") : to,
        durationMs: duration
      });
      events.emit("communication:email_failed", {
        template,
        provider: providerName,
        error: result.error,
        to: Array.isArray(to) ? to : [to]
      });
      return {
        success: false,
        error: result.error,
        provider: providerName,
        durationMs: duration
      };
    }

    metrics.increment("emails_sent", 1, { template, provider: providerName });
    metrics.observeDuration("email_send_duration_ms", duration, { template, provider: providerName });

    logger.logEvent("EmailSent", {
      status: "success",
      template,
      provider: providerName,
      to: Array.isArray(to) ? to.join(",") : to,
      durationMs: duration
    });

    events.emit("communication:email_sent", {
      template,
      provider: providerName,
      to: Array.isArray(to) ? to : [to]
    });

    return {
      success: true,
      provider: providerName,
      messageId: result?.id || null,
      durationMs: duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    metrics.increment("emails_failed", 1, { template, provider: providerName });

    logger.logError("EmailSendFailed", error, {
      template,
      provider: providerName,
      to: Array.isArray(to) ? to.join(",") : to,
      durationMs: duration
    });

    events.emit("communication:email_failed", {
      template,
      provider: providerName,
      error: error.message,
      to: Array.isArray(to) ? to : [to]
    });

    return {
      success: false,
      error: error.message,
      provider: providerName,
      durationMs: duration
    };
  }
}

function getProvider() {
  return provider;
}

function getProviderName() {
  return providerName;
}

module.exports = {
  configure,
  isConfigured,
  getReadiness,
  sendEmail,
  sendDirect,
  getProvider,
  getProviderName
};
