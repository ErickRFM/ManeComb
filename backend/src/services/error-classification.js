function classifyError(error) {
  const statusCode = Number(error?.statusCode || error?.status || 500);
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  if (statusCode === 400 || statusCode === 422 || code.includes("VALIDATION")) {
    return "Validation";
  }

  if (statusCode === 401 || statusCode === 403 || statusCode === 409 || code.includes("BUSINESS")) {
    return "Business";
  }

  if (code.includes("ECONN") || code.includes("ETIMEDOUT") || message.includes("network")) {
    return "Network";
  }

  if (message.includes("mercado") || message.includes("sentry") || message.includes("twilio") || message.includes("resend")) {
    return "External Service";
  }

  if (statusCode >= 500) {
    return "Infrastructure";
  }

  return "Unknown";
}

module.exports = {
  classifyError
};
