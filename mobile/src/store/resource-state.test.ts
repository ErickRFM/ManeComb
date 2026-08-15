import {
  applyIncrementalResourceEvent,
  beginResourceAttempt,
  completeResourceAttempt,
  failResourceAttempt,
  idleResourceState,
} from '@shared/resource-state';

describe('ResourceState authority', () => {
  it('distinguishes initial load, authoritative empty and first-load error', () => {
    const loading = beginResourceAttempt(idleResourceState(), '2026-08-15T10:00:00.000Z');
    expect(loading.status).toBe('loading');
    expect(completeResourceAttempt(loading, { empty: true, source: 'rest' }).status).toBe('empty');
    expect(failResourceAttempt(loading, { errorCode: '500', errorMessage: 'boom' }).status).toBe('error');
  });

  it('keeps successful data visible during refresh and marks a failed refresh stale', () => {
    const ready = completeResourceAttempt(beginResourceAttempt(idleResourceState()), { empty: false, source: 'rest' });
    const refreshing = beginResourceAttempt(ready);
    expect(refreshing.status).toBe('ready');
    expect(refreshing.isRefreshing).toBe(true);
    expect(failResourceAttempt(refreshing, { errorCode: '500', errorMessage: 'boom' }).status).toBe('stale');
  });

  it('does not let an incremental realtime event certify an unloaded or stale collection', () => {
    expect(applyIncrementalResourceEvent(idleResourceState()).status).toBe('idle');
    const stale = { ...idleResourceState(), status: 'stale' as const, lastSuccessfulAt: '2026-08-15T10:00:00.000Z' };
    expect(applyIncrementalResourceEvent(stale)).toEqual(stale);
  });
});
