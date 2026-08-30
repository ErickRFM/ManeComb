const { logger: commLogger } = require("../../../communication-service");
const manecombLogger = require("../../src/services/logger");

commLogger.setLogger(manecombLogger);

module.exports = commLogger;
