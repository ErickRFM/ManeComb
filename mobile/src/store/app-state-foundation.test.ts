import {
  createEmptyOperationalState,
  createIdleMobileResources,
  MOBILE_RESOURCE_DOMAINS,
} from './app-state-foundation';

describe('app-state foundation', () => {
  it('creates a fresh resource-state record per call', () => {
    const first = createIdleMobileResources();
    const second = createIdleMobileResources();

    expect(Object.keys(first)).toEqual(MOBILE_RESOURCE_DOMAINS);
    expect(first).not.toBe(second);

    for (const domain of MOBILE_RESOURCE_DOMAINS) {
      expect(first[domain]).not.toBe(second[domain]);
    }
  });

  it('creates fresh mutable containers for identity teardown', () => {
    const first = createEmptyOperationalState();
    const second = createEmptyOperationalState();

    expect(first.incidents).toEqual([]);
    expect(first.messagesByConversation).toEqual({});
    expect(first.typingByConversation).toEqual({});
    expect(first.readByConversation).toEqual({});

    expect(first.incidents).not.toBe(second.incidents);
    expect(first.messagesByConversation).not.toBe(second.messagesByConversation);
    expect(first.typingByConversation).not.toBe(second.typingByConversation);
    expect(first.readByConversation).not.toBe(second.readByConversation);
  });

  it('resets all identity-scoped operational fields without touching identity itself', () => {
    const reset = createEmptyOperationalState();

    expect(reset).toMatchObject({
      mapData: null,
      operationalUnits: [],
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
    });

    expect(reset).not.toHaveProperty('token');
    expect(reset).not.toHaveProperty('refreshToken');
    expect(reset).not.toHaveProperty('user');
  });
});
