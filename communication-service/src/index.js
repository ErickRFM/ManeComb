const config = require("./config");
const types = require("./core/types");
const validators = require("./core/validators");
const retry = require("./core/retry");
const { createProvider } = require("./providers");
const { getTemplateBuilder, hasTemplate, getTemplateNames } = require("./templates");
const { renderTemplate, renderEmail, extractSubject } = require("./renderer");
const queue = require("./queue");
const { setDeliveryEngine, createEmailWorker } = require("./workers");
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
const deliveryResults = require("./delivery/result");
const security = require("./security");
const { PRIORITY, TEMPLATE_PRIORITY, QUEUE_NAMES } = require("./core/types");

let provider = null;

function configure(cfg) {
  config.configure(cfg);
  history.configurePersistence(cfg.persistence);

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
  health.setProviderReady(Boolean(provider));

  queue.configure({
    enabled: conf.queue.enabled,
    redisUrl: conf.queue.redisUrl,
    persistence: conf.queue.persistence,
    maxmemoryPolicy: conf.queue.maxmemoryPolicy
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
  deliveryEngine.setSendFunction(sendProvider);
  setDeliveryEngine(deliveryEngine);
  createEmailWorker();
}

function isConfigured() {
  return config.isConfigured() && provider !== null;
}

function getReadiness() {
  return health.getReadiness();
}

async function initializePersistence() {
  await history.refreshReadiness();
  await queue.initialize();
  return getReadiness();
}

function getRuntimeDiagnostics() {
  const cfg = config.getConfig();
  const readiness = getReadiness();
  return {
    emailEnabled: cfg.email.enabled,
    emailDryRun: cfg.email.dryRun,
    providerConfigured: readiness.providerConfigured,
    queuesEnabled: readiness.queue.enabled,
    redisConfigured: Boolean(cfg.queue.redisUrl),
    queueMode: readiness.queue.mode,
    queueConnected: readiness.queue.connected,
    queueFunctional: readiness.queue.functional,
    queueDurableAcrossRestart: readiness.queue.durableAcrossRestart,
    workerStarted: readiness.queue.workerStarted,
    maxmemoryPolicy: readiness.queue.maxmemoryPolicy,
    historyMode: readiness.history.mode,
    idempotencyIndexVerified: readiness.history.idempotencyIndex,
    productionDurability: readiness.productionDurability
  };
}

async function sendEmail({ to, recipient, template, eventType, tenantId, organizationId, tenantScope, idempotencyKey, data, priority, from, subject }) {
  const resolvedPriority = priority != null ? validators.normalizePriority(priority) : (TEMPLATE_PRIORITY[template] || PRIORITY.NORMAL);
  const target = recipient || (to ? { email: Array.isArray(to) ? to[0] : to } : null);
  const resolvedScope = tenantScope || (organizationId ? `organization:${organizationId}` : tenantId ? `tenant:${tenantId}` : data?.userId ? `user:${data.userId}` : "");
  const enrichedData = {
    ...data,
    _template: template,
    supportEmail: data?.supportEmail || config.getConfig().supportEmail,
    docsUrl: data?.docsUrl || config.getConfig().docsUrl,
    brandName: config.getConfig().brandName
  };
  const input = {
    recipient: target,
    template,
    eventType,
    tenantScope: resolvedScope,
    tenantId,
    organizationId,
    idempotencyKey,
    data: enrichedData,
    priority: resolvedPriority,
    from,
    subject,
    provider: config.getConfig().provider
  };
  const validation = validators.validateSendEmailInput(input);
  if (!validation.valid) throw new Error(validation.errors.join(", "));
  if (config.getConfig().email.enabled && !config.getConfig().email.dryRun && !isConfigured()) {
    throw new Error("Communication module not configured");
  }
  return resolvedPriority >= PRIORITY.CRITICAL
    ? deliveryEngine.sendDirect(input)
    : deliveryEngine.sendViaQueue(input);
}

async function sendProvider({ to, template, data, from, subject, html, text, provider: providerOpt }) {
  const startTime = Date.now();
  const targetProvider = providerOpt || config.getConfig().provider;

  try {
    const sendProvider = provider || createProvider(targetProvider, config.getConfig().providerConfig);
    const sendWithTimeout = () =>
      timeout.withTimeout(
        () => sendProvider.send({
          to,
          from: from || config.getConfig().defaultFrom,
          subject,
          html,
          text
        }),
        timeout.getTimeoutMs(0, 30000),
        `send:${targetProvider}`
      );

    const result = await sendWithTimeout();
    const duration = Date.now() - startTime;

    if (!result.success) {
      const classified = errors.classifyError(new Error(result.error), targetProvider);
      return {
        success: false,
        error: result.error,
        errorCategory: classified.category,
        provider: targetProvider,
        durationMs: duration
      };
    }

    return {
      success: true,
      provider: targetProvider,
      messageId: result?.id || null,
      durationMs: duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const classified = errors.classifyError(error, targetProvider);

    return {
      success: false,
      error: security.sanitizeProviderError(error),
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
  getRuntimeDiagnostics,
  initializePersistence,
  sendEmail,
  getProvider,
  getProviderName,
  createProvider,
  getTemplateBuilder,
  hasTemplate,
  getTemplateNames,
  renderTemplate,
  renderEmail,
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
  security,
  deliveryResults,
  deliveryEngine
};
