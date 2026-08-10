const { hasCapability } = require("./enterprise-capabilities");

const PERSONAL_PROFILE_FIELDS = Object.freeze([
  "name",
  "email",
  "password",
  "phone",
  "avatarUrl",
  "e2eePublicKey",
  "e2eeKeyRotatedAt"
]);

// El perfil propio conserva datos personales/comerciales. `operationalSchedule`
// se administra sobre el usuario objetivo mediante PATCH /users/:userId y
// `users.manage`, para que Directorio sea la única autoridad de edición.
const COMPANY_PROFILE_FIELDS = Object.freeze([
  ...PERSONAL_PROFILE_FIELDS,
  "companyName",
  "legalName",
  "taxId",
  "billingEmail",
  "billingAddress",
  "preferredMethod",
  "cardholderName",
  "cardBrand",
  "cardLast4",
  "cardExpMonth",
  "cardExpYear",
  "customerReference",
  "companyProfile",
  "paymentProfile"
]);

function pickAllowedFields(payload, allowedFields) {
  const allowed = new Set(allowedFields);
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([key]) => allowed.has(key))
  );
}

function canManageOwnCompanyProfile(user) {
  return user?.accountType === "company_owner" && hasCapability(user, "users.manage");
}

function getSelfProfileFields(user) {
  return canManageOwnCompanyProfile(user)
    ? COMPANY_PROFILE_FIELDS
    : PERSONAL_PROFILE_FIELDS;
}

function pickSelfProfileFields(user, payload) {
  return pickAllowedFields(payload, getSelfProfileFields(user));
}

module.exports = {
  COMPANY_PROFILE_FIELDS,
  PERSONAL_PROFILE_FIELDS,
  canManageOwnCompanyProfile,
  getSelfProfileFields,
  pickSelfProfileFields
};
