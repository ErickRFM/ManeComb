const { StoreDomainRepository } = require("./store-domain-repository");
const { toPlain } = require("../serializers");

const DOCUMENT_METHODS = [
  "createDocument",
  "getDocumentByStorageKey",
  "getDocumentsForUser",
  "listDocuments",
  "reviewDocument"
];

class DocumentRepository extends StoreDomainRepository {
  constructor(store, { DocumentModel } = {}) {
    super(store, DOCUMENT_METHODS);
    this.DocumentModel = DocumentModel || null;
  }

  async getDocumentByStorageKey(storageKey) {
    if (!this.DocumentModel) {
      return this.store.getDocumentByStorageKey(storageKey);
    }

    const document = await this.DocumentModel.findOne({
      storageKey: String(storageKey || "").trim()
    }).lean();

    return document ? toPlain(document) : null;
  }
}

module.exports = {
  DOCUMENT_METHODS,
  DocumentRepository
};
