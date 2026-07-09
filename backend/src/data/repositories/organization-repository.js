const { StoreDomainRepository } = require("./store-domain-repository");

const ORGANIZATION_METHODS = [
  "createActivationKey",
  "findActivationKeyByKey",
  "listActivationKeysForCompany",
  "markActivationKeyUsed",
  "updateActivationKey"
];

class OrganizationRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, ORGANIZATION_METHODS);
  }
}

module.exports = {
  ORGANIZATION_METHODS,
  OrganizationRepository
};
