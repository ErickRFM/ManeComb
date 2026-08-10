type HttpFailure = {
  code?: string | null;
  response?: {
    status?: number;
    data?: { code?: string | null };
  };
};

export function isAuthoritativeSessionFailure(error: unknown) {
  const failure = (error || {}) as HttpFailure;
  return (
    failure.response?.status === 401 ||
    failure.response?.data?.code === 'ACCOUNT_SUSPENDED'
  );
}

export function isTransientSessionFailure(error: unknown) {
  if (isAuthoritativeSessionFailure(error)) return false;
  const failure = (error || {}) as HttpFailure;
  const status = failure.response?.status;
  return (
    typeof status !== 'number' ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    failure.code === 'ERR_NETWORK' ||
    failure.code === 'ECONNABORTED' ||
    failure.code === 'ETIMEDOUT'
  );
}
