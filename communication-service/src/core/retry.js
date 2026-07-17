const { PRIORITY, RETRY_DELAYS, MAX_RETRIES } = require("./types");

function getMaxRetries(priority) {
  if (priority >= PRIORITY.CRITICAL) return MAX_RETRIES.CRITICAL;
  if (priority >= PRIORITY.HIGH) return MAX_RETRIES.HIGH;
  if (priority >= PRIORITY.NORMAL) return MAX_RETRIES.NORMAL;
  return MAX_RETRIES.LOW;
}

function getDelays(priority) {
  if (priority >= PRIORITY.CRITICAL) return RETRY_DELAYS[PRIORITY.CRITICAL];
  if (priority >= PRIORITY.HIGH) return RETRY_DELAYS[PRIORITY.HIGH];
  if (priority >= PRIORITY.NORMAL) return RETRY_DELAYS[PRIORITY.NORMAL];
  return RETRY_DELAYS[PRIORITY.LOW];
}

function getBackoffDelay(attempt, priority) {
  const delays = getDelays(priority);
  const index = Math.min(attempt, delays.length - 1);
  return delays[Math.max(0, index)];
}

function getJobOptions(priority) {
  const maxRetries = getMaxRetries(priority);

  return {
    attempts: maxRetries + 1,
    backoff: {
      type: "exponential",
      delay: 1000
    },
    removeOnComplete: 100,
    removeOnFail: maxRetries >= 3 ? 200 : 50
  };
}

function shouldRetry(attempt, priority, error) {
  const maxRetries = getMaxRetries(priority);

  if (attempt >= maxRetries) return false;

  if (error) {
    const msg = String(error.message || error).toLowerCase();
    if (msg.includes("bounce") || msg.includes("reject") || msg.includes("invalid")) return false;
    if (msg.includes("rate limit") || msg.includes("too many")) return true;
  }

  return true;
}

module.exports = {
  getMaxRetries,
  getDelays,
  getBackoffDelay,
  getJobOptions,
  shouldRetry
};
