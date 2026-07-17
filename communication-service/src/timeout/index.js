function withTimeout(promiseFn, timeoutMs, label = "operation") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.code = "TIMEOUT";
      err.timeoutMs = timeoutMs;
      reject(err);
    }, timeoutMs);

    promiseFn().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function getTimeoutMs(priority, defaultTimeout = 30000) {
  if (priority >= 10) return Math.max(defaultTimeout, 60000);
  if (priority >= 5) return Math.max(defaultTimeout, 45000);
  if (priority >= 1) return defaultTimeout;
  return defaultTimeout;
}

module.exports = {
  withTimeout,
  getTimeoutMs
};
