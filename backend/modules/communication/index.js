const comm = require("../../../communication-service");
const logger = require("./communication.logger");

module.exports = {
  configure: comm.configure,
  isConfigured: comm.isConfigured,
  getReadiness: comm.getReadiness,
  getRuntimeDiagnostics: comm.getRuntimeDiagnostics,
  initializePersistence: comm.initializePersistence,
  sendEmail: comm.sendEmail,
  getProvider: comm.getProvider,
  getProviderName: comm.getProviderName,
  createProvider: comm.createProvider,
  getTemplateBuilder: comm.getTemplateBuilder,
  hasTemplate: comm.hasTemplate,
  getTemplateNames: comm.getTemplateNames,
  renderTemplate: comm.renderTemplate,
  renderEmail: comm.renderEmail,
  extractSubject: comm.extractSubject,
  types: comm.types,
  validators: comm.validators,
  history: comm.history,
  metrics: comm.metrics,
  events: comm.events,
  retry: comm.retry,
  logger,
  security: comm.security,
  deliveryResults: comm.deliveryResults,
  deliveryEngine: comm.deliveryEngine
};
