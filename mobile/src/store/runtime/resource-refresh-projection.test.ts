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

  it('collects fulfilled data and normalizes only map data', () => {
    const normalizeMapData = jest.fn((value: unknown) => ({
      normalized: value,
      vehicles: [{ id: 'v-1' }],
    }));
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: { vehicles: [{ id: 'raw' }] } },
      { status: 'fulfilled', value: [{ id: 'u-1' }] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [{ id: 'contact-1' }] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: null },
      { status: 'fulfilled', value: [] },
    ];

    const projection = projectMobileRefreshResults({
      results,
      currentResources: createIdleMobileResources(),
      normalizeMapData,
      toFailure: () => ({ errorCode: 'unused', errorMessage: 'unused' }),
    });

    expect(projection.fulfilledCount).toBe(10);
    expect(normalizeMapData).toHaveBeenCalledTimes(1);
    expect(normalizeMapData).toHaveBeenCalledWith({ vehicles: [{ id: 'raw' }] });
    expect(projection.data.mapData).toEqual({
      normalized: { vehicles: [{ id: 'raw' }] },
      vehicles: [{ id: 'v-1' }],
    });
    expect(projection.data.chatContacts).toEqual([{ id: 'contact-1' }]);
    expect(projection.data.activeRouteSession).toBeNull();
  });

  it('marks tracked domains ready or empty from the projected values', () => {
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

    expect(projection.resources.mapData.status).toBe('ready');
    expect(projection.resources.operationalUnits.status).toBe('ready');
    expect(projection.resources.incidents.status).toBe('empty');
    expect(projection.resources.conversations.status).toBe('ready');
    expect(projection.resources.documents.status).toBe('empty');
    expect(projection.resources.routeSessionHistory.status).toBe('empty');
  });

  it('preserves stale semantics when a tracked refresh fails after prior success', () => {
    const current = createIdleMobileResources();
    current.incidents = completeResourceAttempt(
      beginResourceAttempt(idleResourceState()),
      { empty: false, source: 'rest' }
    );

    const reason = new Error('boom');
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: { vehicles: [] } },
      { status: 'fulfilled', value: [] },
      { status: 'rejected', reason },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: [] },
      { status: 'fulfilled', value: null },
      { status: 'fulfilled', value: [] },
    ];
    const toFailure = jest.fn(() => ({
      errorCode: '500',
      errorMessage: 'No se pudo actualizar incidents.',
    }));

    const projection = projectMobileRefreshResults({
      results,
      currentResources: current,
      normalizeMapData: (value) => value,
      toFailure,
    });

    expect(toFailure).toHaveBeenCalledWith('incidents', reason);
    expect(projection.fulfilledCount).toBe(9);
    expect(projection.resources.incidents.status).toBe('stale');
    expect(projection.resources.incidents.errorCode).toBe('500');
  });

  it('does not create ResourceState authorities for chat contacts or active route session', () => {
    const projection = projectMobileRefreshResults({
      results: MOBILE_REFRESH_RESULT_KEYS.map(() => ({
        status: 'fulfilled',
        value: [],
      })) as PromiseSettledResult<unknown>[],
      currentResources: createIdleMobileResources(),
      normalizeMapData: () => ({ vehicles: [] }),
      toFailure: () => ({ errorCode: 'unused', errorMessage: 'unused' }),
    });

    expect(Object.keys(projection.resources)).not.toContain('chatContacts');
    expect(Object.keys(projection.resources)).not.toContain('activeRouteSession');
  });


  it('begins refresh for every tracked resource without changing domain ownership', () => {
    const current = createIdleMobileResources();
    current.documents = completeResourceAttempt(
      beginResourceAttempt(idleResourceState()),
      { empty: false, source: 'rest' }
    );

    const refreshing = beginMobileResourceRefresh(current);

    expect(Object.keys(refreshing)).toEqual(Object.keys(current));
    expect(refreshing.documents.status).toBe('ready');
    expect(refreshing.documents.isRefreshing).toBe(true);
    expect(refreshing.incidents.status).toBe('loading');
    expect(refreshing.incidents.isRefreshing).toBe(true);
  });

  it('fails every tracked resource through the same injected error policy', () => {
    const current = beginMobileResourceRefresh(createIdleMobileResources());
    const toFailure = jest.fn((domain: string) => ({
      errorCode: `error:${domain}`,
      errorMessage: `No se pudo actualizar ${domain}.`,
    }));

    const failed = failMobileResourceRefresh(current, toFailure);

    expect(toFailure).toHaveBeenCalledTimes(Object.keys(current).length);
    expect(failed.mapData.status).toBe('error');
    expect(failed.mapData.errorCode).toBe('error:mapData');
    expect(failed.users.status).toBe('error');
    expect(failed.users.errorMessage).toBe('No se pudo actualizar users.');
  });
});
