let pino = null;

try {
  pino = require("pino");
} catch {
  pino = null;
}

function createLogger(scope) {
  if (pino) {
    return pino({
      name: `manecomb-${scope}`,
      level: process.env.LOG_LEVEL || "info",
      base: {
        service: "manecomb-api",
        scope
      }
    });
  }

  return {
    info: (payload, message) => console.log(message || payload),
    warn: (payload, message) => console.warn(message || payload),
    error: (payload, message) => console.error(message || payload),
    debug: (payload, message) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug(message || payload);
      }
    }
  };
}

module.exports = {
  createLogger
};
