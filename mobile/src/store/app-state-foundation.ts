import { idleResourceState, type ResourceState } from '@shared/resource-state';

export const MOBILE_RESOURCE_DOMAINS = [
  'operationalUnits',
  'mapData',
  'incidents',
  'documents',
  'notifications',
  'users',
  'conversations',
  'routeSessionHistory',
] as const;

export type MobileResourceDomain = (typeof MOBILE_RESOURCE_DOMAINS)[number];

export function createIdleMobileResources(): Record<MobileResourceDomain, ResourceState> {
  return Object.fromEntries(
    MOBILE_RESOURCE_DOMAINS.map((domain) => [domain, idleResourceState()])
  ) as Record<MobileResourceDomain, ResourceState>;
}

/**
 * Creates the identity-scoped operational state that must be cleared whenever
 * the authenticated identity ends. This module deliberately has no dependency
 * on root-store/useAppStore so the teardown boundary can evolve independently.
 */
export function createEmptyOperationalState() {
  return {
    mapData: null,
    operationalUnits: [],
    resources: createIdleMobileResources(),
    incidents: [],
    conversations: [],
    chatContacts: [],
    presenceByUser: {},
    messagesByConversation: {},
    chatPageInfoByConversation: {},
    isLoadingOlderChatByConversation: {},
    documents: [],
    notifications: [],
    users: [],
    activeRouteSession: null,
    routeSessionHistory: [],
    activeConversationId: null,
    focusedIncidentId: null,
    typingByConversation: {},
    readByConversation: {},
    pendingSyncCount: 0,
    lastCacheAt: null,
    lastSyncedAt: null,
    isRefreshing: false,
  };
}
