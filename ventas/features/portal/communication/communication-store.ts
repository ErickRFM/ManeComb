import type { Socket } from 'socket.io-client';
import { create } from 'zustand';
import type {
  ChatDeliveryStatus,
  CommunicationContact,
  CommunicationConversation,
  CommunicationMessage,
  DirectMessageEnvelope,
} from '@shared/communication';
import {
  getCommunicationContacts,
  getCommunicationConversations,
  getCommunicationMessages,
  openCommunicationDirectConversation,
  sendCommunicationMediaMessage,
  sendCommunicationTextMessage,
  sendCommunicationVoiceMessage,
  type CommunicationMessagePageInfo,
} from './api';

export type PortalCommunicationMessage = CommunicationMessage & {
  localStatus?: ChatDeliveryStatus;
  localError?: string | null;
  clientMessageId?: string;
};

type MessageBucket = {
  items: PortalCommunicationMessage[];
  pageInfo?: CommunicationMessagePageInfo;
  loaded: boolean;
  loading: boolean;
};

type CommunicationState = {
  conversations: CommunicationConversation[];
  contacts: CommunicationContact[];
  messagesByConversation: Record<string, MessageBucket>;
  selectedConversationId: string | null;
  onlineUserIds: string[];
  typingByConversation: Record<string, string[]>;
  loading: boolean;
  sending: boolean;
  error: string | null;
  _socket: Socket | null;
  _socketCleanup: (() => void) | null;

  initialize: () => Promise<void>;
  reset: () => void;
  bindSocket: (socket: Socket | null) => void;
  selectConversation: (conversationId: string | null) => Promise<void>;
  openDirect: (targetUserId: string) => Promise<string | null>;
  loadMore: (conversationId: string) => Promise<void>;
  sendText: (
    conversationId: string,
    text: string,
    encrypted?: { e2eeEnvelope: DirectMessageEnvelope; textPreview?: string } | null
  ) => Promise<{ ok: boolean; message?: string }>;
  sendMedia: (conversationId: string, file: File, caption?: string) => Promise<{ ok: boolean; message?: string }>;
  sendVoice: (conversationId: string, blob: Blob, durationSeconds: number) => Promise<{ ok: boolean; message?: string }>;
  retryText: (conversationId: string, clientMessageId: string) => Promise<{ ok: boolean; message?: string }>;
  setTyping: (conversationId: string, typing: boolean) => void;
};

const emptyBucket = (): MessageBucket => ({ items: [], loaded: false, loading: false });

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function makeClientMessageId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function sortMessages(messages: PortalCommunicationMessage[]) {
  return [...messages].sort((a, b) => {
    const left = Date.parse(a.createdAt || '') || 0;
    const right = Date.parse(b.createdAt || '') || 0;
    if (left !== right) return left - right;
    return String(a.id).localeCompare(String(b.id));
  });
}

function upsertMessage(
  items: PortalCommunicationMessage[],
  message: PortalCommunicationMessage,
  optimisticClientId?: string | null
) {
  const optimisticIndex = optimisticClientId
    ? items.findIndex((entry) => entry.clientMessageId === optimisticClientId)
    : -1;
  const existingIndex = items.findIndex((entry) => entry.id === message.id);
  const index = existingIndex >= 0 ? existingIndex : optimisticIndex;
  if (index < 0) return sortMessages([...items, message]);
  const next = [...items];
  next[index] = { ...next[index], ...message, localStatus: message.localStatus || message.status || 'sent', localError: null };
  return sortMessages(next);
}

function getConversationIdFromMessage(message: CommunicationMessage) {
  return String(message.conversationId || '').trim();
}

function humanizeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const usePortalCommunicationStore = create<CommunicationState>((set, get) => {
  const updateMessageStatus = (
    conversationId: string,
    messageId: string,
    status: ChatDeliveryStatus
  ) => {
    set((state) => {
      const bucket = state.messagesByConversation[conversationId];
      if (!bucket) return state;
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: {
            ...bucket,
            items: bucket.items.map((message) =>
              message.id === messageId
                ? { ...message, status: status === 'sending' ? message.status : status as CommunicationMessage['status'], localStatus: status }
                : message
            ),
          },
        },
      };
    });
  };

  const joinKnownConversations = (socket: Socket | null = get()._socket) => {
    if (!socket?.connected) return;
    get().conversations.forEach((conversation) => {
      socket.emit('conversation:join', conversation.id);
    });
  };

  const acknowledgeMessage = (message: CommunicationMessage, asRead = false) => {
    const socket = get()._socket;
    const conversationId = getConversationIdFromMessage(message);
    if (!socket || !conversationId || !message.id) return;
    socket.emit('chat:delivered', { conversationId, messageId: message.id });
    if (asRead) socket.emit('chat:read', { conversationId, messageId: message.id });
  };

  const refreshDirectory = async () => {
    const [conversations, contacts] = await Promise.all([
      getCommunicationConversations(),
      getCommunicationContacts(),
    ]);
    set({ conversations, contacts, error: null });
    joinKnownConversations();
  };

  const bindSocket = (socket: Socket | null) => {
    const current = get()._socket;
    if (current === socket) return;
    get()._socketCleanup?.();

    if (!socket) {
      set({ _socket: null, _socketCleanup: null, onlineUserIds: [], typingByConversation: {} });
      return;
    }

    const onConnect = () => joinKnownConversations(socket);
    const onPresenceSnapshot = (payload: { userIds?: string[] } = {}) => {
      set({ onlineUserIds: unique((payload.userIds || []).filter(Boolean)) });
    };
    const onPresenceUpdated = (payload: { userId?: string; status?: string } = {}) => {
      const userId = String(payload.userId || '').trim();
      if (!userId) return;
      set((state) => ({
        onlineUserIds:
          payload.status === 'online'
            ? unique([...state.onlineUserIds, userId])
            : state.onlineUserIds.filter((entry) => entry !== userId),
      }));
    };
    const onMessage = (message: CommunicationMessage) => {
      const conversationId = getConversationIdFromMessage(message);
      if (!conversationId) {
        void refreshDirectory().catch(() => undefined);
        return;
      }
      set((state) => {
        const bucket = state.messagesByConversation[conversationId] || emptyBucket();
        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: {
              ...bucket,
              items: upsertMessage(bucket.items, { ...message, localStatus: message.status || 'sent' }),
            },
          },
        };
      });
      const selected = get().selectedConversationId === conversationId;
      acknowledgeMessage(message, selected);
      void refreshDirectory().catch(() => undefined);
    };
    const onDelivered = (payload: { conversationId?: string; messageId?: string } = {}) => {
      if (payload.conversationId && payload.messageId) {
        updateMessageStatus(payload.conversationId, payload.messageId, 'delivered');
      }
    };
    const onRead = (payload: { conversationId?: string; messageId?: string } = {}) => {
      if (payload.conversationId && payload.messageId) {
        updateMessageStatus(payload.conversationId, payload.messageId, 'read');
      }
    };
    const onTyping = (payload: { conversationId?: string; userId?: string } = {}) => {
      if (!payload.conversationId || !payload.userId) return;
      set((state) => ({
        typingByConversation: {
          ...state.typingByConversation,
          [payload.conversationId!]: unique([
            ...(state.typingByConversation[payload.conversationId!] || []),
            payload.userId!,
          ]),
        },
      }));
    };
    const onTypingStop = (payload: { conversationId?: string; userId?: string } = {}) => {
      if (!payload.conversationId || !payload.userId) return;
      set((state) => ({
        typingByConversation: {
          ...state.typingByConversation,
          [payload.conversationId!]: (state.typingByConversation[payload.conversationId!] || []).filter(
            (entry) => entry !== payload.userId
          ),
        },
      }));
    };

    const handlers: Array<[string, (...args: any[]) => void]> = [
      ['connect', onConnect],
      ['presence:snapshot', onPresenceSnapshot],
      ['presence:updated', onPresenceUpdated],
      ['chat:message', onMessage],
      ['chat:delivered', onDelivered],
      ['chat:read', onRead],
      ['chat:typing', onTyping],
      ['chat:typing:stop', onTypingStop],
    ];
    handlers.forEach(([event, handler]) => socket.on(event, handler));
    const cleanup = () => handlers.forEach(([event, handler]) => socket.off(event, handler));
    set({ _socket: socket, _socketCleanup: cleanup });
    joinKnownConversations(socket);
  };

  const loadConversation = async (conversationId: string, before?: string | null) => {
    const current = get().messagesByConversation[conversationId] || emptyBucket();
    if (current.loading) return;
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: { ...current, loading: true },
      },
    }));
    try {
      const response = await getCommunicationMessages(conversationId, { before, limit: 50 });
      set((state) => {
        const bucket = state.messagesByConversation[conversationId] || emptyBucket();
        const merged = before
          ? sortMessages([...response.data, ...bucket.items])
          : sortMessages(response.data);
        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: {
              items: merged,
              pageInfo: response.pageInfo,
              loaded: true,
              loading: false,
            },
          },
        };
      });
      const socket = get()._socket;
      socket?.emit('conversation:join', conversationId);
      if (get().selectedConversationId === conversationId) {
        response.data.forEach((message) => acknowledgeMessage(message, true));
      }
    } catch (error) {
      set((state) => ({
        error: humanizeError(error, 'No fue posible cargar la conversación.'),
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: {
            ...(state.messagesByConversation[conversationId] || emptyBucket()),
            loading: false,
          },
        },
      }));
    }
  };

  const sendTextInternal = async (
    conversationId: string,
    text: string,
    clientMessageId: string,
    encrypted?: { e2eeEnvelope: DirectMessageEnvelope; textPreview?: string } | null,
    reuseOptimistic = false
  ) => {
    const trimmed = text.trim();
    if (!trimmed && !encrypted?.e2eeEnvelope?.ciphertext) {
      return { ok: false, message: 'Escribe un mensaje.' };
    }

    if (!reuseOptimistic) {
      const optimistic: PortalCommunicationMessage = {
        id: `local:${clientMessageId}`,
        clientMessageId,
        senderId: '',
        conversationId,
        kind: 'text',
        text: encrypted ? '' : trimmed,
        textPreview: encrypted?.textPreview,
        e2eeEnvelope: encrypted?.e2eeEnvelope || null,
        encrypted: Boolean(encrypted),
        createdAt: new Date().toISOString(),
        localStatus: 'sending',
      };
      set((state) => {
        const bucket = state.messagesByConversation[conversationId] || emptyBucket();
        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: {
              ...bucket,
              loaded: true,
              items: sortMessages([...bucket.items, optimistic]),
            },
          },
        };
      });
    } else {
      set((state) => {
        const bucket = state.messagesByConversation[conversationId] || emptyBucket();
        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: {
              ...bucket,
              items: bucket.items.map((entry) =>
                entry.clientMessageId === clientMessageId
                  ? { ...entry, localStatus: 'sending', localError: null }
                  : entry
              ),
            },
          },
        };
      });
    }

    try {
      const sent = await sendCommunicationTextMessage(conversationId, {
        text: encrypted ? undefined : trimmed,
        textPreview: encrypted?.textPreview,
        clientMessageId,
        e2eeEnvelope: encrypted?.e2eeEnvelope || null,
      });
      set((state) => {
        const bucket = state.messagesByConversation[conversationId] || emptyBucket();
        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: {
              ...bucket,
              items: upsertMessage(
                bucket.items,
                { ...sent, localStatus: sent.status || 'sent', clientMessageId },
                clientMessageId
              ),
            },
          },
        };
      });
      void refreshDirectory().catch(() => undefined);
      return { ok: true };
    } catch (error) {
      const message = humanizeError(error, 'No fue posible enviar el mensaje.');
      set((state) => {
        const bucket = state.messagesByConversation[conversationId] || emptyBucket();
        return {
          error: message,
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: {
              ...bucket,
              items: bucket.items.map((entry) =>
                entry.clientMessageId === clientMessageId
                  ? { ...entry, localStatus: 'failed', localError: message }
                  : entry
              ),
            },
          },
        };
      });
      return { ok: false, message };
    }
  };

  return {
    conversations: [],
    contacts: [],
    messagesByConversation: {},
    selectedConversationId: null,
    onlineUserIds: [],
    typingByConversation: {},
    loading: false,
    sending: false,
    error: null,
    _socket: null,
    _socketCleanup: null,

    initialize: async () => {
      if (get().loading) return;
      set({ loading: true, error: null });
      try {
        await refreshDirectory();
      } catch (error) {
        set({ error: humanizeError(error, 'No fue posible cargar Comunicación.') });
      } finally {
        set({ loading: false });
      }
    },

    reset: () => {
      get()._socketCleanup?.();
      set({
        conversations: [],
        contacts: [],
        messagesByConversation: {},
        selectedConversationId: null,
        onlineUserIds: [],
        typingByConversation: {},
        loading: false,
        sending: false,
        error: null,
        _socket: null,
        _socketCleanup: null,
      });
    },

    bindSocket,

    selectConversation: async (conversationId) => {
      set({ selectedConversationId: conversationId, error: null });
      if (!conversationId) return;
      const bucket = get().messagesByConversation[conversationId];
      get()._socket?.emit('conversation:join', conversationId);
      if (!bucket?.loaded) await loadConversation(conversationId);
      const current = get().messagesByConversation[conversationId]?.items || [];
      current.forEach((message) => acknowledgeMessage(message, true));
    },

    openDirect: async (targetUserId) => {
      try {
        const conversation = await openCommunicationDirectConversation(targetUserId);
        set((state) => ({
          conversations: [
            conversation,
            ...state.conversations.filter((entry) => entry.id !== conversation.id),
          ],
          selectedConversationId: conversation.id,
          error: null,
        }));
        get()._socket?.emit('conversation:join', conversation.id);
        await loadConversation(conversation.id);
        return conversation.id;
      } catch (error) {
        set({ error: humanizeError(error, 'No fue posible abrir la conversación.') });
        return null;
      }
    },

    loadMore: async (conversationId) => {
      const bucket = get().messagesByConversation[conversationId];
      const before = bucket?.pageInfo?.nextBefore || bucket?.items[0]?.id || null;
      if (!before) return;
      await loadConversation(conversationId, before);
    },

    sendText: async (conversationId, text, encrypted = null) => {
      return await sendTextInternal(conversationId, text, makeClientMessageId(), encrypted, false);
    },

    retryText: async (conversationId, clientMessageId) => {
      const entry = get().messagesByConversation[conversationId]?.items.find(
        (message) => message.clientMessageId === clientMessageId
      );
      if (!entry || entry.localStatus !== 'failed') return { ok: false, message: 'Mensaje no disponible.' };
      return await sendTextInternal(
        conversationId,
        entry.text || '',
        clientMessageId,
        entry.e2eeEnvelope
          ? { e2eeEnvelope: entry.e2eeEnvelope, textPreview: entry.textPreview }
          : null,
        true
      );
    },

    sendMedia: async (conversationId, file, caption = '') => {
      if (get().sending) return { ok: false, message: 'Hay un envío en curso.' };
      set({ sending: true, error: null });
      try {
        const message = await sendCommunicationMediaMessage(conversationId, file, caption);
        set((state) => {
          const bucket = state.messagesByConversation[conversationId] || emptyBucket();
          return {
            messagesByConversation: {
              ...state.messagesByConversation,
              [conversationId]: {
                ...bucket,
                items: upsertMessage(bucket.items, { ...message, localStatus: message.status || 'sent' }),
              },
            },
          };
        });
        void refreshDirectory().catch(() => undefined);
        return { ok: true };
      } catch (error) {
        const message = humanizeError(error, 'No fue posible enviar el archivo.');
        set({ error: message });
        return { ok: false, message };
      } finally {
        set({ sending: false });
      }
    },

    sendVoice: async (conversationId, blob, durationSeconds) => {
      if (get().sending) return { ok: false, message: 'Hay un envío en curso.' };
      set({ sending: true, error: null });
      try {
        const message = await sendCommunicationVoiceMessage(conversationId, blob, durationSeconds);
        set((state) => {
          const bucket = state.messagesByConversation[conversationId] || emptyBucket();
          return {
            messagesByConversation: {
              ...state.messagesByConversation,
              [conversationId]: {
                ...bucket,
                items: upsertMessage(bucket.items, { ...message, localStatus: message.status || 'sent' }),
              },
            },
          };
        });
        void refreshDirectory().catch(() => undefined);
        return { ok: true };
      } catch (error) {
        const message = humanizeError(error, 'No fue posible enviar la nota de voz.');
        set({ error: message });
        return { ok: false, message };
      } finally {
        set({ sending: false });
      }
    },

    setTyping: (conversationId, typing) => {
      const socket = get()._socket;
      if (!socket || !conversationId) return;
      socket.emit(typing ? 'chat:typing' : 'chat:typing:stop', { conversationId });
    },
  };
});
