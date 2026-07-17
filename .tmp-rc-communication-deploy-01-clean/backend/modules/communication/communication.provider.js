const providers = require("../../../communication-service/src/providers");

module.exports = {
  createProvider: providers.createProvider,
  BaseProvider: providers.BaseProvider,
  PROVIDER_CLASSES: providers.PROVIDER_CLASSES
};
