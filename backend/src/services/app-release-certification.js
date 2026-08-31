const RELEASE_PUBLICATION_FIELDS = Object.freeze([
  "version",
  "buildNumber",
  "sourceCommit",
  "sha256",
  "apkUrl",
  "releaseDate"
]);

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function isReleaseDate(value) {
  const text = String(value || "").trim();
  if (!RELEASE_DATE_PATTERN.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function getReleaseCertificationErrors(config = {}) {
  const errors = [];
  const version = String(config.version || "").trim();
  const buildNumber = Number(config.buildNumber);
  const sourceCommit = String(config.sourceCommit || "").trim();
  const sha256 = String(config.sha256 || "").trim();
  const apkUrl = String(config.apkUrl || "").trim();
  const releaseDate = String(config.releaseDate || "").trim();

  if (!SEMVER_PATTERN.test(version)) errors.push("version");
  if (!Number.isInteger(buildNumber) || buildNumber < 1) errors.push("buildNumber");
  if (!SOURCE_COMMIT_PATTERN.test(sourceCommit)) errors.push("sourceCommit");
  if (!SHA256_PATTERN.test(sha256)) errors.push("sha256");
  if (!isHttpUrl(apkUrl)) errors.push("apkUrl");
  if (!isReleaseDate(releaseDate)) errors.push("releaseDate");

  return errors;
}

function isCertifiedAppRelease(config) {
  return Boolean(config) && getReleaseCertificationErrors(config).length === 0;
}

module.exports = {
  RELEASE_PUBLICATION_FIELDS,
  SEMVER_PATTERN,
  SOURCE_COMMIT_PATTERN,
  SHA256_PATTERN,
  RELEASE_DATE_PATTERN,
  getReleaseCertificationErrors,
  isCertifiedAppRelease,
  isHttpUrl,
  isReleaseDate
};
