type RateLimitResponse = {
  data?: { retryAfterSeconds?: unknown };
  headers?: Record<string, unknown>;
};

export function parseRetryAfterSeconds(response: RateLimitResponse | undefined, now = Date.now()) {
  const bodyValue = Number(response?.data?.retryAfterSeconds);
  if (Number.isFinite(bodyValue) && bodyValue > 0) return Math.ceil(bodyValue);

  const headerValue = response?.headers?.['retry-after'];
  const numericHeader = Number(headerValue);
  if (Number.isFinite(numericHeader) && numericHeader > 0) return Math.ceil(numericHeader);

  if (typeof headerValue === 'string') {
    const retryAt = Date.parse(headerValue);
    if (Number.isFinite(retryAt) && retryAt > now) {
      return Math.max(1, Math.ceil((retryAt - now) / 1000));
    }
  }

  return null;
}

export function formatRetryAfter(retryAfterSeconds: number) {
  return retryAfterSeconds >= 60
    ? `${Math.ceil(retryAfterSeconds / 60)} min`
    : `${retryAfterSeconds} s`;
}
