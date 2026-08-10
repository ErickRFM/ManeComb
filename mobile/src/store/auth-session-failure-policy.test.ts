import {
  isAuthoritativeSessionFailure,
  isTransientSessionFailure,
} from './auth-session-failure-policy';

describe('auth session failure authority', () => {
  it.each([429, 500, 503])('keeps session authority for HTTP %s', (status) => {
    const error = { response: { status } };
    expect(isTransientSessionFailure(error)).toBe(true);
    expect(isAuthoritativeSessionFailure(error)).toBe(false);
  });

  it('treats timeout and network failures as recoverable', () => {
    expect(isTransientSessionFailure({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTransientSessionFailure({ code: 'ERR_NETWORK' })).toBe(true);
  });

  it('keeps rejected refresh and account suspension authoritative', () => {
    expect(isAuthoritativeSessionFailure({ response: { status: 401 } })).toBe(true);
    expect(isTransientSessionFailure({ response: { status: 401 } })).toBe(false);
    expect(isAuthoritativeSessionFailure({
      response: { status: 401, data: { code: 'ACCOUNT_SUSPENDED' } },
    })).toBe(true);
  });
});
