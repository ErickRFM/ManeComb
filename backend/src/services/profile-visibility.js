const { hasCapability } = require("./enterprise-capabilities");

function getOrganizationId(user) {
  return String(user?.organizationId || user?.companyId || "").trim();
}

function canViewProfileDocuments(user) {
  return Boolean(
    user &&
    (user.role === "driver" || hasCapability(user, "documents.manage"))
  );
}

function filterProfileDocumentsForViewer(user, documents) {
  if (!canViewProfileDocuments(user)) return [];

  const organizationId = getOrganizationId(user);
  if (!organizationId) return [];

  return (Array.isArray(documents) ? documents : []).filter((document) => {
    const documentOrganizationId = String(
      document?.organizationId || document?.companyId || ""
    ).trim();

    if (!documentOrganizationId || documentOrganizationId !== organizationId) {
      return false;
    }

    if (user.role === "driver") {
      return document.ownerType === "driver" && document.ownerId === user.id;
    }

    return true;
  });
}

function sanitizeProfileForViewer(user, profile) {
  if (!profile || typeof profile !== "object") return profile;

  return {
    ...profile,
    documents: filterProfileDocumentsForViewer(user, profile.documents)
  };
}

module.exports = {
  canViewProfileDocuments,
  filterProfileDocumentsForViewer,
  sanitizeProfileForViewer
};
