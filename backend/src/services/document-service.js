const { DOCUMENT_METHODS } = require("../data/repositories/document-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class DocumentService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, DOCUMENT_METHODS);
  }
}

module.exports = {
  DocumentService
};
