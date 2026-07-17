const commLogger = require("../../../communication-service/src/logger");
const manecombLogger = require("../../src/services/logger");

commLogger.setLogger(manecombLogger);

module.exports = commLogger;
