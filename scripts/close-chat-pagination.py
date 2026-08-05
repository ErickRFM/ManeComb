from pathlib import Path
import re


def replace_once(path, old, new, label):
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"{label}: pattern not found in {path}")
    target.write_text(text.replace(old, new, 1))


# API: keep the legacy full-history request for Radio and add an explicit cursor page for Chat.
client = Path("mobile/src/api/client.ts")
text = client.read_text()
old = """export async function getMessagesRequest(conversationId: string) {
  const response = await apiClient.get<{ ok: boolean; data: ChatMessage[] }>(
    `/chat/conversations/${conversationId}/messages`
  );
  return response.data.data;
}
"""
new = old + """
export type ChatMessagePageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

export async function getMessagesPageRequest(
  conversationId: string,
  options: { before?: string | null; limit?: number } = {}
) {
  const response = await apiClient.get<{
    ok: boolean;
    data: ChatMessage[];
    pageInfo: ChatMessagePageInfo;
  }>(`/chat/conversations/${conversationId}/messages`, {
    params: {
      limit: options.limit || 50,
      ...(options.before ? { before: options.before } : {}),
    },
  });
  return {
    items: response.data.data,
    pageInfo: response.data.pageInfo,
  };
}
"""
if old not in text:
    raise SystemExit("getMessagesRequest block not found")
client.write_text(text.replace(old, new, 1))

root = Path("mobile/src/store/root-store.ts")
text = root.read_text()
# Import the paged request alongside the existing full request.
old_import = "  getMessagesRequest,"
if old_import not in text:
    raise SystemExit("getMessagesRequest import not found")
text = text.replace(old_import, "  getMessagesPageRequest,\n  getMessagesRequest,", 1)

# Canonical page type and state/action contracts.
anchor = "type NetworkStatus = 'unknown' | 'online' | 'offline' | 'recovering';"
page_type = """type ChatPageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

"""
if anchor not in text:
    raise SystemExit("network status type anchor not found")
text = text.replace(anchor, page_type + anchor, 1)

old_fields = """  messagesByConversation: Record<string, ChatMessage[]>;
  documents: DocumentItem[];"""
new_fields = """  messagesByConversation: Record<string, ChatMessage[]>;
  chatPageInfoByConversation: Record<string, ChatPageInfo>;
  isLoadingOlderChatByConversation: Record<string, boolean>;
  documents: DocumentItem[];"""
if old_fields not in text:
    raise SystemExit("AppState message fields not found")
text = text.replace(old_fields, new_fields, 1)

old_actions = """  loadConversation: (conversationId: string) => Promise<void>;
  loadChatContacts: () => Promise<void>;"""
new_actions = """  loadConversation: (conversationId: string) => Promise<void>;
  loadChatConversation: (conversationId: string) => Promise<void>;
  loadOlderChatMessages: (conversationId: string) => Promise<void>;
  loadChatContacts: () => Promise<void>;"""
if old_actions not in text:
    raise SystemExit("AppState load actions not found")
text = text.replace(old_actions, new_actions, 1)

# Reset page state on logout/tenant rotation.
old_empty = """    messagesByConversation: {},
    documents: [],"""
new_empty = """    messagesByConversation: {},
    chatPageInfoByConversation: {},
    isLoadingOlderChatByConversation: {},
    documents: [],"""
if old_empty not in text:
    raise SystemExit("empty operational state messages not found")
text = text.replace(old_empty, new_empty, 1)

old_initial = """  authContext: null, user: null, mapData: null, operationalUnits: [], incidents: [], conversations: [], chatContacts: [], presenceByUser: {}, messagesByConversation: {}, documents: [], notifications: [], observability: null, users: [], activeRouteSession: null, routeSessionHistory: [],"""
new_initial = """  authContext: null, user: null, mapData: null, operationalUnits: [], incidents: [], conversations: [], chatContacts: [], presenceByUser: {}, messagesByConversation: {}, chatPageInfoByConversation: {}, isLoadingOlderChatByConversation: {}, documents: [], notifications: [], observability: null, users: [], activeRouteSession: null, routeSessionHistory: [],"""
if old_initial not in text:
    raise SystemExit("initial store state messages not found")
text = text.replace(old_initial, new_initial, 1)

# refreshAll: only Chat uses bounded pages; Radio keeps complete history behavior.
old_refresh = """      const aid = curr.activeConversationId || data.conversations?.[0]?.id || null;
      if (aid) {
        try {
          const ms = await getMessagesRequest(aid);
          const hms = await hydrateMessages(ms, data.conversations || curr.conversations, get().user, aid);
          data.messagesByConversation = { ...curr.messagesByConversation, [aid]: hms };
          data.activeConversationId = aid;
        } catch (error) {
          logStoreError('refreshAll:messages', error);
        }
      }"""
new_refresh = """      const aid = curr.activeConversationId || data.conversations?.[0]?.id || null;
      if (aid) {
        try {
          const availableConversations = data.conversations || curr.conversations;
          const activeConversation = availableConversations.find(
            (conversation: ConversationSummary) => conversation.id === aid
          );
          const page = activeConversation?.channelMode === 'chat'
            ? await getMessagesPageRequest(aid)
            : null;
          const ms = page ? page.items : await getMessagesRequest(aid);
          const hms = await hydrateMessages(ms, availableConversations, get().user, aid);
          data.messagesByConversation = { ...curr.messagesByConversation, [aid]: hms };
          if (page) {
            data.chatPageInfoByConversation = {
              ...curr.chatPageInfoByConversation,
              [aid]: page.pageInfo,
            };
          }
          data.activeConversationId = aid;
        } catch (error) {
          logStoreError('refreshAll:messages', error);
        }
      }"""
if old_refresh not in text:
    raise SystemExit("refreshAll message block not found")
text = text.replace(old_refresh, new_refresh, 1)

# Insert Chat-specific page actions after the legacy full-history loader.
legacy_loader = """  loadConversation: async (id) => {
    set({ isLoadingConversation: true });
    try {
      const ms = await getMessagesRequest(id);
      const hms = await hydrateMessages(ms, get().conversations, get().user, id);
      set(s => ({
        messagesByConversation: {
          ...s.messagesByConversation,
          [id]: mergeConversationMessages(s.messagesByConversation[id] || [], hms),
        },
      }));
      socket?.emit('conversation:join', id);
    } catch (error) { logStoreError('loadConversation', error); }
    finally { set({ isLoadingConversation: false }); }
  },"""
chat_loaders = legacy_loader + """
  loadChatConversation: async (id) => {
    set({ isLoadingConversation: true });
    try {
      const page = await getMessagesPageRequest(id);
      const hydrated = await hydrateMessages(page.items, get().conversations, get().user, id);
      set(state => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [id]: mergeConversationMessages(state.messagesByConversation[id] || [], hydrated),
        },
        chatPageInfoByConversation: {
          ...state.chatPageInfoByConversation,
          [id]: page.pageInfo,
        },
      }));
      socket?.emit('conversation:join', id);
    } catch (error) {
      logStoreError('loadChatConversation', error);
    } finally {
      set({ isLoadingConversation: false });
    }
  },
  loadOlderChatMessages: async (id) => {
    const current = get();
    const pageInfo = current.chatPageInfoByConversation[id];
    if (
      current.isLoadingOlderChatByConversation[id] ||
      !pageInfo?.hasMore ||
      !pageInfo.nextCursor
    ) {
      return;
    }
    set(state => ({
      isLoadingOlderChatByConversation: {
        ...state.isLoadingOlderChatByConversation,
        [id]: true,
      },
    }));
    try {
      const page = await getMessagesPageRequest(id, { before: pageInfo.nextCursor });
      const hydrated = await hydrateMessages(page.items, get().conversations, get().user, id);
      set(state => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [id]: mergeConversationMessages(hydrated, state.messagesByConversation[id] || []),
        },
        chatPageInfoByConversation: {
          ...state.chatPageInfoByConversation,
          [id]: page.pageInfo,
        },
      }));
    } catch (error) {
      logStoreError('loadOlderChatMessages', error);
    } finally {
      set(state => ({
        isLoadingOlderChatByConversation: {
          ...state.isLoadingOlderChatByConversation,
          [id]: false,
        },
      }));
    }
  },"""
if legacy_loader not in text:
    raise SystemExit("legacy loadConversation block not found")
text = text.replace(legacy_loader, chat_loaders, 1)

# Direct Chat: page latest messages; other channel modes keep full history.
old_direct = """      const [ms, cc] = await Promise.all([getMessagesRequest(c.id), getChatContactsRequest()]);
      const ncs = upsertConversation(get().conversations, c);
      const hms = await hydrateMessages(ms, ncs, get().user, c.id);
      set(s => ({ conversations: ncs, chatContacts: cc.map(contact => ({ ...contact, status: s.presenceByUser[contact.id] || 'offline' })), activeConversationId: c.id, messagesByConversation: { ...s.messagesByConversation, [c.id]: mergeConversationMessages(s.messagesByConversation[c.id] || [], hms) } }));"""
new_direct = """      const [page, cc] = await Promise.all([
        m === 'chat'
          ? getMessagesPageRequest(c.id)
          : getMessagesRequest(c.id).then(items => ({
              items,
              pageInfo: { hasMore: false, nextCursor: null },
            })),
        getChatContactsRequest(),
      ]);
      const ncs = upsertConversation(get().conversations, c);
      const hms = await hydrateMessages(page.items, ncs, get().user, c.id);
      set(s => ({
        conversations: ncs,
        chatContacts: cc.map(contact => ({
          ...contact,
          status: s.presenceByUser[contact.id] || 'offline',
        })),
        activeConversationId: c.id,
        messagesByConversation: {
          ...s.messagesByConversation,
          [c.id]: mergeConversationMessages(s.messagesByConversation[c.id] || [], hms),
        },
        ...(m === 'chat'
          ? {
              chatPageInfoByConversation: {
                ...s.chatPageInfoByConversation,
                [c.id]: page.pageInfo,
              },
            }
          : {}),
      }));"""
if old_direct not in text:
    raise SystemExit("openDirect messages block not found")
text = text.replace(old_direct, new_direct, 1)

old_general = """      const ms = await getMessagesRequest(c.id);
      const ncs = upsertConversation(get().conversations, c);
      const hms = await hydrateMessages(ms, ncs, get().user, c.id);
      set(s => ({ conversations: ncs, ...(setActive ? { activeConversationId: c.id } : {}), messagesByConversation: { ...s.messagesByConversation, [c.id]: mergeConversationMessages(s.messagesByConversation[c.id] || [], hms) } }));"""
new_general = """      const page = m === 'chat'
        ? await getMessagesPageRequest(c.id)
        : {
            items: await getMessagesRequest(c.id),
            pageInfo: { hasMore: false, nextCursor: null },
          };
      const ncs = upsertConversation(get().conversations, c);
      const hms = await hydrateMessages(page.items, ncs, get().user, c.id);
      set(s => ({
        conversations: ncs,
        ...(setActive ? { activeConversationId: c.id } : {}),
        messagesByConversation: {
          ...s.messagesByConversation,
          [c.id]: mergeConversationMessages(s.messagesByConversation[c.id] || [], hms),
        },
        ...(m === 'chat'
          ? {
              chatPageInfoByConversation: {
                ...s.chatPageInfoByConversation,
                [c.id]: page.pageInfo,
              },
            }
          : {}),
      }));"""
if old_general not in text:
    raise SystemExit("openGeneral messages block not found")
text = text.replace(old_general, new_general, 1)

# Push intents use the bounded loader for Chat only.
old_push = """        set({ activeConversationId: i.conversationId }); await get().loadConversation(i.conversationId); return;"""
new_push = """        set({ activeConversationId: i.conversationId });
        if (i.target === 'chat') await get().loadChatConversation(i.conversationId);
        else await get().loadConversation(i.conversationId);
        return;"""
if old_push not in text:
    raise SystemExit("push conversation load block not found")
text = text.replace(old_push, new_push, 1)
root.write_text(text)

# Chat controller consumes only the bounded Chat actions and triggers older-page loading at the top.
controller = Path("mobile/src/screens/chat/hooks/use-chat-controller.ts")
text = controller.read_text()
text = text.replace("    loadConversation,\n", "    loadChatConversation,\n    loadOlderChatMessages,\n", 1)
text = text.replace(
    "    messagesByConversation,\n",
    "    messagesByConversation,\n    chatPageInfoByConversation,\n    isLoadingOlderChatByConversation,\n",
    1,
)
text = text.replace(
    "      loadConversation: state.loadConversation,\n",
    "      loadChatConversation: state.loadChatConversation,\n      loadOlderChatMessages: state.loadOlderChatMessages,\n",
    1,
)
text = text.replace(
    "      messagesByConversation: state.messagesByConversation,\n",
    "      messagesByConversation: state.messagesByConversation,\n      chatPageInfoByConversation: state.chatPageInfoByConversation,\n      isLoadingOlderChatByConversation: state.isLoadingOlderChatByConversation,\n",
    1,
)
text = text.replace("loadConversation(preferredConversation.id)", "loadChatConversation(preferredConversation.id)")
text = text.replace("    loadConversation,\n", "    loadChatConversation,\n")
text = text.replace("loadConversation(fallbackConversation.id)", "loadChatConversation(fallbackConversation.id)")
text = text.replace("      loadConversation(conversationId).catch", "      loadChatConversation(conversationId).catch")

scroll_anchor = """  const startRecordingTicker = () => {"""
scroll_wrapper = """  const activeChatPageInfo = activeConversation
    ? chatPageInfoByConversation[activeConversation.id] || null
    : null;
  const isLoadingOlderMessages = activeConversation
    ? Boolean(isLoadingOlderChatByConversation[activeConversation.id])
    : false;
  const handleChatMessagesScroll = useCallback(
    (event: Parameters<typeof handleMessagesScroll>[0]) => {
      handleMessagesScroll(event);
      if (
        event.nativeEvent.contentOffset.y <= 80 &&
        activeConversation &&
        activeChatPageInfo?.hasMore &&
        !isLoadingOlderMessages
      ) {
        void loadOlderChatMessages(activeConversation.id);
      }
    },
    [
      activeChatPageInfo?.hasMore,
      activeConversation,
      handleMessagesScroll,
      isLoadingOlderMessages,
      loadOlderChatMessages,
    ]
  );

"""
if scroll_anchor not in text:
    raise SystemExit("controller scroll insertion anchor not found")
text = text.replace(scroll_anchor, scroll_wrapper + scroll_anchor, 1)
text = text.replace("    handleMessagesScroll,\n", "    handleChatMessagesScroll,\n", 1)
text = text.replace(
    "    isSubmitting,\n    markAsRead,",
    "    isSubmitting,\n    isLoadingOlderMessages,\n    hasOlderMessages: Boolean(activeChatPageInfo?.hasMore),\n    markAsRead,",
    1,
)
controller.write_text(text)

# View: preserve visible position and expose a compact loading header.
view = Path("mobile/src/screens/chat/components/chat-screen-view.tsx")
text = view.read_text()
text = text.replace(
    "import { FlatList, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';",
    "import { ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';",
    1,
)
text = text.replace("    handleMessagesScroll,\n", "    handleChatMessagesScroll,\n", 1)
text = text.replace(
    "    isCompact,\n",
    "    hasOlderMessages,\n    isCompact,\n    isLoadingOlderMessages,\n",
    1,
)
text = text.replace("                  onScroll={handleMessagesScroll}\n", "                  onScroll={handleChatMessagesScroll}\n", 1)
list_marker = """                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  renderItem="""
list_new = """                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                  ListHeaderComponent={
                    isLoadingOlderMessages ? (
                      <View style={styles.typingIndicator}>
                        <ActivityIndicator size="small" color={theme.colors.info} />
                        <Text style={styles.typingIndicatorText}>Cargando mensajes anteriores…</Text>
                      </View>
                    ) : hasOlderMessages ? (
                      <View style={styles.typingIndicator}>
                        <Text style={styles.typingIndicatorText}>
                          Desliza hasta arriba para cargar mensajes anteriores.
                        </Text>
                      </View>
                    ) : null
                  }
                  renderItem="""
if list_marker not in text:
    raise SystemExit("FlatList pagination marker not found")
view.write_text(text.replace(list_marker, list_new, 1))

# Regression tests: page contract + single-flight guard are protected even if UI refactors.
Path("mobile/src/utils/chat-pagination.test.ts").write_text(
    """import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('chat pagination wiring', () => {
  it('uses the cursor endpoint and a single-flight older-page guard', () => {
    const client = readFileSync(resolve(__dirname, '../api/client.ts'), 'utf8');
    const store = readFileSync(resolve(__dirname, '../store/root-store.ts'), 'utf8');
    const view = readFileSync(
      resolve(__dirname, '../screens/chat/components/chat-screen-view.tsx'),
      'utf8'
    );
    expect(client).toContain('getMessagesPageRequest');
    expect(client).toContain('before: options.before');
    expect(store).toContain('isLoadingOlderChatByConversation[id]');
    expect(store).toContain('pageInfo.nextCursor');
    expect(view).toContain('maintainVisibleContentPosition');
  });
});
"""
)
