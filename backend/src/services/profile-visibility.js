const { hasCapability } = require("./enterprise-capabilities");

function canViewProfileDocuments(user) {
  return Boolean(
    user &&
    (user.role === "driver" || hasCapability(user, "documents.manage"))
  );
}

function sanitizeProfileForViewer(user, profile) {
  if (!profile || typeof profile !== "object") return profile;
  if (canViewProfileDocuments(user)) return profile;

  return {
    ...profile,
    documents: []
  };
}

module.exports = {
  canViewProfileDocuments,
  sanitizeProfileForViewer
};
