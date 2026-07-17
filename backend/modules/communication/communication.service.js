const logger = require("../../../communication-service/src/logger");
const types = require("../../../communication-service/src/core/types");
const validators = require("../../../communication-service/src/core/validators");
const retry = require("../../../communication-service/src/core/retry");
const { createProvider } = require("../../../communication-service/src/providers");
const { getTemplateBuilder } = require("../../../communication-service/src/templates");
const { renderTemplate, extractSubject } = require("../../../communication-service/src/renderer");
const queue = require("../../../communication-service/src/queue");
const workers = require("../../../communication-service/src/workers");
const history = require("../../../communication-service/src/history");
const metrics = require("../../../communication-service/src/metrics");
const events = require("../../../communication-service/src/events");
const config = require("../../../communication-service/src/config");
const health = require("../../../communication-service/src/health");

const { PRIORITY, TEMPLATE_PRIORITY, QUEUE_NAMES, PROVIDER } = types;

let provider = null;
let providerName = null;
let configured = false;

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
    logger.logWarn("ProviderConfigInvalid", `Proveedor ${conf.provider} no configurado: ${providerValidation.errors.join(", ")}. Comunicación deshabilitada.`, {
      provider: conf.provider,
      errors: providerValidation.errors
    });
    provider = null;
    providerName = null;
  } else {
    provider = createProvider(conf.provider, providerCfg);
    providerName = conf.provider;
  }

  queue.configure({
    enabled: conf.queue.enabled,
    redisUrl: conf.queue.redisUrl
  });

  workers.setSendFunction(sendDirect);
  workers.createEmailWorker();

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
    queue: queue.getReadiness(),
    metrics: metrics.getSnapshot()
  };
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
      from: from || config.getConfig().defaultFrom,
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
