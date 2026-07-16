const service = require("./communication.service");
const types = require("./communication.types");
const validators = require("./communication.validators");
const history = require("./communication.history");
const metrics = require("./communication.metrics");
const events = require("./communication.events");
const retry = require("./communication.retry");
const logger = require("./communication.logger");
const { createProvider } = require("./communication.provider");
const { getTemplateBuilder, hasTemplate, getTemplateNames } = require("./communication.templates");
const { renderTemplate, extractSubject } = require("./communication.renderer");

module.exports = {
  configure: service.configure,
  isConfigured: service.isConfigured,
  getReadiness: service.getReadiness,
  sendEmail: service.sendEmail,
  getProvider: service.getProvider,
  getProviderName: service.getProviderName,

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
  logger
};
