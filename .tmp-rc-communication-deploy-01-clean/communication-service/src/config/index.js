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
  legalName: "ManeComb"
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
    legalName: cfg.legalName || "ManeComb"
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
