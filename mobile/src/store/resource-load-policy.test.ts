import { shouldSkipResourceLoad } from '@shared/resource-load-policy';

describe('Portal load TTL policy', () => {
  it('allows a domain retry even while the full-load TTL is fresh', () => {
    const common = { lastFullLoadAt: 10_000, now: 10_500, ttlMs: 30_000 };
    expect(shouldSkipResourceLoad({ ...common, scope: 'full' })).toBe(true);
    expect(shouldSkipResourceLoad({ ...common, scope: 'domain' })).toBe(false);
  });
});
