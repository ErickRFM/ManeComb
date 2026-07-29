let configuration = {
  provider: null,
  providerConfig: {},
  providerName: null,
  queue: { enabled: false, redisUrl: "" },
  socketIO: null,
  defaultFrom: "",
  supportEmail: "",
  docsUrl: "",
  brandName: "ManeComb",
  legalName: "ManeComb",
  email: {
    enabled: true,
    dryRun: false,
    requireDurableQueue: false,
    requireDurableHistory: true
  },
  delivery: {
    sendTimeoutMs: 30000,
    rateLimitTokens: 10,
    rateLimitRefillRate: 1,
    rateLimitIntervalMs: 1000,
    maxConnections: 10,
    connectionIdleTimeoutMs: 30000
  }
};

let configured = false;

function configure(cfg) {
  configuration = {
    provider: cfg.provider || configuration.provider,
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
    legalName: cfg.legalName || "ManeComb",
    email: {
      enabled: cfg.email?.enabled !== false,
      dryRun: Boolean(cfg.email?.dryRun),
      requireDurableQueue: Boolean(cfg.email?.requireDurableQueue),
      requireDurableHistory: cfg.email?.requireDurableHistory !== false
    },
    delivery: {
      sendTimeoutMs: cfg.delivery?.sendTimeoutMs || configuration.delivery.sendTimeoutMs,
      rateLimitTokens: cfg.delivery?.rateLimitTokens || configuration.delivery.rateLimitTokens,
      rateLimitRefillRate: cfg.delivery?.rateLimitRefillRate || configuration.delivery.rateLimitRefillRate,
      rateLimitIntervalMs: cfg.delivery?.rateLimitIntervalMs || configuration.delivery.rateLimitIntervalMs,
      maxConnections: cfg.delivery?.maxConnections || configuration.delivery.maxConnections,
      connectionIdleTimeoutMs: cfg.delivery?.connectionIdleTimeoutMs || configuration.delivery.connectionIdleTimeoutMs
    }
  };
  configured = true;
}

function getConfig() {
  return configuration;
}

function isConfigured() {
  return configured;
}

function setConfigured(value) {
  configured = value;
}

module.exports = {
  configure,
  getConfig,
  isConfigured,
  setConfigured
};
