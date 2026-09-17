import {
  beginResourceAttempt,
  completeResourceAttempt,
  failResourceAttempt,
  type ResourceState,
} from '@shared/resource-state';
import {
  MOBILE_RESOURCE_DOMAINS,
  type MobileResourceDomain,
} from '../app-state-foundation';

export const MOBILE_REFRESH_RESULT_KEYS = [
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
] as const;

export type MobileRefreshResultKey = (typeof MOBILE_REFRESH_RESULT_KEYS)[number];

type RefreshData = Partial<Record<MobileRefreshResultKey, unknown>>;
type ResourceFailure = { errorCode: string; errorMessage: string; };

const MOBILE_RESOURCE_RESULT_INDEX: Record<MobileResourceDomain, number> = {
  mapData: 0,
  operationalUnits: 1,
  incidents: 2,
  conversations: 3,
  documents: 5,
  notifications: 6,
  users: 7,
  routeSessionHistory: 9,
};

function isResourceValueEmpty(domain: MobileResourceDomain, value: unknown) {
  if (Array.isArray(value)) return value.length === 0;
  if (domain === 'mapData') {
    const mapData = value as { vehicles?: unknown } | null | undefined;
    return !mapData || !Array.isArray(mapData.vehicles) || mapData.vehicles.length === 0;
  }
  return value == null;
}

export function beginMobileResourceRefresh(
  currentResources: Record<MobileResourceDomain, ResourceState>
) {
  return Object.fromEntries(
    MOBILE_RESOURCE_DOMAINS.map((domain) => [
      domain,
      beginResourceAttempt(currentResources[domain]),
    ])
  ) as Record<MobileResourceDomain, ResourceState>;
}

export function failMobileResourceRefresh(
  currentResources: Record<MobileResourceDomain, ResourceState>,
  toFailure: (domain: MobileResourceDomain) => ResourceFailure
) {
  return Object.fromEntries(
    MOBILE_RESOURCE_DOMAINS.map((domain) => [
      domain,
      failResourceAttempt(currentResources[domain], toFailure(domain)),
    ])
  ) as Record<MobileResourceDomain, ResourceState>;
}

export function projectMobileRefreshResults(input: {
  results: PromiseSettledResult<unknown>[];
  currentResources: Record<MobileResourceDomain, ResourceState>;
  normalizeMapData: (value: unknown) => unknown;
  toFailure: (domain: MobileResourceDomain, reason: unknown) => ResourceFailure;
}) {
  const { results, currentResources, normalizeMapData, toFailure } = input;
  const data: RefreshData = {};
  let fulfilledCount = 0;

  results.forEach((result, index) => {
    const key = MOBILE_REFRESH_RESULT_KEYS[index];
    if (!key || result.status !== 'fulfilled') return;
    data[key] = key === 'mapData' ? normalizeMapData(result.value) : result.value;
    fulfilledCount += 1;
  });

  const resources = { ...currentResources };
  for (const domain of MOBILE_RESOURCE_DOMAINS) {
    const result = results[MOBILE_RESOURCE_RESULT_INDEX[domain]];
    if (!result) throw new Error(`Missing refresh result for ${domain}`);

    if (result.status === 'fulfilled') {
      resources[domain] = completeResourceAttempt(resources[domain], {
        empty: isResourceValueEmpty(domain, data[domain]),
        source: 'rest',
      });
    } else {
      resources[domain] = failResourceAttempt(
        resources[domain],
        toFailure(domain, result.reason)
      );
    }
  }

  return { data, fulfilledCount, resources };
}
