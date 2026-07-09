const { SESSION_METHODS } = require("../data/repositories/session-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class SessionStoreService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, SESSION_METHODS);
  }
}

module.exports = {
  SessionStoreService
};
