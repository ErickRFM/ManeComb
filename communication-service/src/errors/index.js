class CommunicationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.category = options.category || "unknown";
    this.retryable = options.retryable !== false;
    this.statusCode = options.statusCode || 0;
    this.provider = options.provider || null;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BounceError extends CommunicationError {
  constructor(message, options = {}) {
    super(message, { ...options, category: "bounce", retryable: false });
  }
}

class RejectError extends CommunicationError {
  constructor(message, options = {}) {
    super(message, { ...options, category: "reject", retryable: false });
  }
}

class RateLimitError extends CommunicationError {
  constructor(message, options = {}) {
    super(message, { ...options, category: "rate_limit", retryable: true, statusCode: 429 });
  }
}

class TimeoutError extends CommunicationError {
  constructor(message, options = {}) {
    super(message, { ...options, category: "timeout", retryable: true });
  }
}

class AuthError extends CommunicationError {
  constructor(message, options = {}) {
    super(message, { ...options, category: "auth", retryable: false });
  }
}

class InvalidAddressError extends CommunicationError {
  constructor(message, options = {}) {
    super(message, { ...options, category: "invalid_address", retryable: false });
  }
}

class ProviderError extends CommunicationError {
  constructor(message, options = {}) {
    super(message, { ...options, category: "provider", retryable: true });
  }
}

function classifyError(error, provider) {
  const msg = String(error.message || error).toLowerCase();
  if (msg.includes("bounce") || msg.includes("550") || msg.includes("5.1.1") || msg.includes("user unknown")) {
    return new BounceError(error.message, { provider, statusCode: error.statusCode || 550 });
  }
  if (msg.includes("reject") || msg.includes("554") || msg.includes("spam")) {
    return new RejectError(error.message, { provider, statusCode: error.statusCode || 554 });
  }
  if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("429")) {
    return new RateLimitError(error.message, { provider, statusCode: 429 });
  }
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("etimedout")) {
    return new TimeoutError(error.message, { provider });
  }
  if (msg.includes("auth") || msg.includes("credentials") || msg.includes("unauthorized") || msg.includes("535")) {
    return new AuthError(error.message, { provider, statusCode: error.statusCode || 535 });
  }
  if (msg.includes("invalid") && (msg.includes("email") || msg.includes("address"))) {
    return new InvalidAddressError(error.message, { provider });
  }
  return new ProviderError(error.message, { provider, statusCode: error.statusCode });
}

module.exports = {
  CommunicationError,
  BounceError,
  RejectError,
  RateLimitError,
  TimeoutError,
  AuthError,
  InvalidAddressError,
  ProviderError,
  classifyError
};
