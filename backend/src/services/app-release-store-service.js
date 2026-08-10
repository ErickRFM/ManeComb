const { APP_RELEASE_METHODS } = require("../data/repositories/app-release-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class AppReleaseStoreService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, APP_RELEASE_METHODS);
  }
}

module.exports = {
  AppReleaseStoreService
};
