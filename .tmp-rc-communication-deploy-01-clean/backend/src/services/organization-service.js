const { ORGANIZATION_METHODS } = require("../data/repositories/organization-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class OrganizationService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, ORGANIZATION_METHODS);
  }
}

module.exports = {
  OrganizationService
};
