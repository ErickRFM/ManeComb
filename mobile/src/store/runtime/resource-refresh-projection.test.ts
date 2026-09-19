import {
  beginResourceAttempt,
  completeResourceAttempt,
  idleResourceState,
} from '@shared/resource-state';
import { createIdleMobileResources } from '../app-state-foundation';
import {
  MOBILE_REFRESH_RESULT_KEYS,
  beginMobileResourceRefresh,
  failMobileResourceRefresh,
  projectMobileRefreshResults,
} from './resource-refresh-projection';

describe('mobile resource refresh projection', () => {
  it('keeps the REST result order stable', () => {
    expect(MOBILE_REFRESH_RESULT_KEYS).toEqual([
      'mapData',
      'operationalUnits',
      'incidents',
      'conversations',
      'chatContacts',
      'documents',
      'notifications',
      'users',
      'activeRouteSession',
      'routeSessionHistory',
    ]);
  });

  it('projects fulfilled data and tracked resource status', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: { vehicles: [{ id: 'v-1' }] } },
      { status: 'fulfilled', value: [{ id: 'u-1' }] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [{ id: 'c-1' }] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: null },
      { status: 'fulfilled', value: [] },
    ];

    const projection = projectMobileRefreshResults({
      results,
      currentResources: createIdleMobileResources(),
      normalizeMapData: (value) => value,
      toFailure: () => ({ errorCode: 'unused', errorMessage: 'unused' }),
    });

    expect(projection.fulfilledCount).toBe(10);
    expect(projection.resources.mapData.status).toBe('ready');
    expect(projection.resources.operationalUnits.status).toBe('ready');
    expect(projection.resources.incidents.status).toBe('empty');
    expect(projection.resources.conversations.status).toBe('ready');
    expect(Object.keys(projection.resources)).not.toContain('chatContacts');
    expect(Object.keys(projection.resources)).not.toContain('activeRouteSession');
  });

  it('preserves stale semantics when one tracked refresh fails', () => {
    const current = createIdleMobileResources();
    current.incidents = completeResourceAttempt(
      beginResourceAttempt(idleResourceState()),
      { empty: false, source: 'rest' }
    );
    const reason = new Error('boom');
    const results: PromiseSettledResult<unknown>[] = MOBILE_REFRESH_RESULT_KEYS.map(() => ({
      status: 'fulfilled',
      value: [],
    })) as PromiseSettledResult<unknown>[];
    results[2] = { status: 'rejected', reason };

    const projection = projectMobileRefreshResults({
      results,
      currentResources: current,
      normalizeMapData: () => ({ vehicles: [] }),
      toFailure: () => ({ errorCode: '500', errorMessage: 'failed' }),
    });

    expect(projection.resources.incidents.status).toBe('stale');
    expect(projection.resources.incidents.errorCode).toBe('500');
  });

  it('centralizes begin and failure transitions without changing ResourceState semantics', () => {
    const current = createIdleMobileResources();
    current.documents = completeResourceAttempt(
      beginResourceAttempt(idleResourceState()),
      { empty: false, source: 'rest' }
    );

    const refreshing = beginMobileResourceRefresh(current);
    const failed = failMobileResourceRefresh(refreshing, (domain) => ({
      errorCode: `error:${domain}`,
      errorMessage: `failed:${domain}`,
    }));

    expect(refreshing.mapData.status).toBe('loading');
    expect(refreshing.mapData.isRefreshing).toBe(false);
    expect(refreshing.documents.status).toBe('ready');
    expect(refreshing.documents.isRefreshing).toBe(true);
    expect(failed.mapData.status).toBe('error');
    expect(failed.documents.status).toBe('stale');
    expect(failed.users.errorCode).toBe('error:users');
  });
});
