const ACCEPTED_STATUSES = new Set([
  "created",
  "processing",
  "queued",
  "sent",
  "dry_run",
  "skipped"
]);

const FINAL_STATUSES = new Set([
  "sent",
  "failed",
  "dry_run",
  "skipped"
]);

function getDeliveryStatus(result) {
  if (typeof result?.status === "string" && result.status.trim()) {
    return result.status.trim().toLowerCase();
  }
  if (result?.queued === true) return "queued";
  if (result?.success === true) return "sent";
  if (result?.success === false || result?.failed === true) return "failed";
  return "unknown";
}

function isDeliveryAccepted(result) {
  if (typeof result?.accepted === "boolean") return result.accepted;
  return ACCEPTED_STATUSES.has(getDeliveryStatus(result));
}

function isDeliveryFailed(result) {
  if (typeof result?.failed === "boolean") return result.failed;
  return getDeliveryStatus(result) === "failed";
}

function isDeliveryFinal(result) {
  if (typeof result?.final === "boolean") return result.final;
  return FINAL_STATUSES.has(getDeliveryStatus(result));
}

function createDeliveryResult(input = {}) {
  const status = getDeliveryStatus(input);
  const accepted = ACCEPTED_STATUSES.has(status);
  const delivered = status === "sent";
  const failed = status === "failed";

  return {
    ...input,
    status,
    success: accepted,
    accepted,
    delivered,
    queued: status === "queued",
    simulated: status === "dry_run",
    skipped: status === "skipped",
    duplicate: input.duplicate === true,
    failed,
    final: FINAL_STATUSES.has(status)
  };
}

module.exports = {
  createDeliveryResult,
  getDeliveryStatus,
  isDeliveryAccepted,
  isDeliveryFailed,
  isDeliveryFinal
};
