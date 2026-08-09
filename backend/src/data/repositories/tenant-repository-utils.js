function getEnterpriseOrganizationId(actor) {
  return String(actor?.organizationId || actor?.companyId || "").trim();
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

function mapMaybePromise(value, mapper) {
  return isPromiseLike(value) ? value.then(mapper) : mapper(value);
}

function isSameEnterpriseOrganization(actor, resource) {
  const organizationId = getEnterpriseOrganizationId(actor);
  if (!organizationId || !resource) return false;
  return String(resource.organizationId || "").trim() === organizationId;
}

module.exports = {
  getEnterpriseOrganizationId,
  isPromiseLike,
  isSameEnterpriseOrganization,
  mapMaybePromise
};
