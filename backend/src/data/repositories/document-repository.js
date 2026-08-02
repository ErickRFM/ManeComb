const { StoreDomainRepository } = require("./store-domain-repository");
const { toPlain } = require("../serializers");

const DOCUMENT_METHODS = [
  "createDocument",
  "getDocumentById",
  "getDocumentByStorageKey",
  "getDocumentsForUser",
  "listDocuments",
  "listDocumentVersions",
  "replaceDocument",
  "reviewDocument",
  "softDeleteDocument",
  "updateDocument"
];

class DocumentRepository extends StoreDomainRepository {
  constructor(store, { DocumentModel } = {}) {
    super(store, DOCUMENT_METHODS);
    this.DocumentModel = DocumentModel || null;
  }

  async getDocumentByStorageKey(storageKey, filters = {}) {
    if (!this.DocumentModel) {
      return this.store.getDocumentByStorageKey(storageKey, filters);
    }

    const query = {
      storageKey: String(storageKey || "").trim(),
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.includeDeleted ? {} : { deletedAt: null })
    };
    const document = await this.DocumentModel.findOne(query).lean();

    return document ? toPlain(document) : null;
  }
}

module.exports = {
  DOCUMENT_METHODS,
  DocumentRepository
};
