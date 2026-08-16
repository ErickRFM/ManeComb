const { AUDIT_LOG_METHODS } = require("../data/repositories/audit-log-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class AuditLogService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, AUDIT_LOG_METHODS);
  }
}

module.exports = {
  AuditLogService
};
