import { useMemo } from 'react';
import type {
  ChatDirectoryContact,
  ChatMessage,
  ConversationSummary,
} from '@/src/types/app';
import type {
  DirectoryListItem,
  DirectoryMode,
  LocalTextMessage,
} from '../types';
import {
  buildMessageList,
  getContactSearchText,
  getConversationContact,
  getConversationLastActivityTime,
  getConversationPreview,
  isPriorityConversation,
} from '../utils/conversation';

type UseChatDirectoryDataOptions = {
  activeConversationId: string | null;
  chatContacts: ChatDirectoryContact[];
  chatConversations: ConversationSummary[];
  directoryMode: DirectoryMode;
  messagesByConversation: Record<string, ChatMessage[]>;
  pendingTextMessages: LocalTextMessage[];
  search: string;
  userId?: string | null;
};

export function useChatDirectoryData({
  activeConversationId,
  chatContacts,
  chatConversations,
  directoryMode,
  messagesByConversation,
  pendingTextMessages,
  search,
  userId,
}: UseChatDirectoryDataOptions) {
  const activeConversation =
    chatConversations.find((conversation) => conversation.id === activeConversationId) ||
    chatConversations[0] ||
    null;
  const activeConversationKey = activeConversation?.id || null;
  const activeMessages = useMemo(
    () => (activeConversationKey ? messagesByConversation[activeConversationKey] || [] : []),
    [activeConversationKey, messagesByConversation]
  );
  const activePendingTextMessages = useMemo(
    () =>
      activeConversationKey
        ? pendingTextMessages.filter((message) => message.conversationId === activeConversationKey)
        : [],
    [activeConversationKey, pendingTextMessages]
  );
  const visibleMessages = useMemo(
    () => [...activeMessages, ...activePendingTextMessages],
    [activeMessages, activePendingTextMessages]
  );
  const activeContact = activeConversation ? getConversationContact(activeConversation, userId) : null;
  const searchTerm = search.trim().toLowerCase();
  const activeMessageItems = useMemo(() => buildMessageList(visibleMessages), [visibleMessages]);
  const conversationFilterCounts = useMemo(
    () => ({
      all: chatConversations.length,
      priority: chatConversations.filter(isPriorityConversation).length,
      unread: chatConversations.filter((conversation) => conversation.unreadCount > 0).length,
    }),
    [chatConversations]
  );
  const filteredConversations = useMemo(() => {
    const visibleConversations = chatConversations.filter((conversation) => {
      if (directoryMode === 'priority' && !isPriorityConversation(conversation)) {
        return false;
      }

      if (directoryMode === 'unread' && conversation.unreadCount === 0) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const contact = getConversationContact(conversation, userId);
      const searchableText = [
        conversation.title,
        conversation.description || '',
        getConversationPreview(conversation),
        contact?.name || '',
        ...(messagesByConversation[conversation.id] || []).flatMap((message) => [
          message.text || '',
          message.textPreview || '',
          message.transcript || '',
        ]),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });

    return visibleConversations.sort((left, right) => {
      const activeDiff =
        Number(right.id === activeConversationId) - Number(left.id === activeConversationId);

      if (activeDiff) {
        return activeDiff;
      }

      const unreadDiff = right.unreadCount - left.unreadCount;

      if (unreadDiff) {
        return unreadDiff;
      }

      const lastActivityDiff =
        getConversationLastActivityTime(right) - getConversationLastActivityTime(left);

      if (lastActivityDiff) {
        return lastActivityDiff;
      }

      return left.title.localeCompare(right.title);
    });
  }, [activeConversationId, chatConversations, directoryMode, messagesByConversation, searchTerm, userId]);
  const filteredContacts = useMemo(() => {
    if (!searchTerm || directoryMode !== 'all') {
      return [];
    }

    return chatContacts.filter((contact) => getContactSearchText(contact).includes(searchTerm));
  }, [chatContacts, directoryMode, searchTerm]);
  const visibleConversations = filteredConversations;
  const visibleContacts = useMemo(() => {
    const visibleConversationIds = new Set(visibleConversations.map((conversation) => conversation.id));

    return filteredContacts.filter(
      (contact) => !contact.directConversationId || !visibleConversationIds.has(contact.directConversationId)
    );
  }, [filteredContacts, visibleConversations]);
  const visibleDirectoryCount = visibleConversations.length + visibleContacts.length;
  const hasGeneralConversation = filteredConversations.some(
    (conversation) => conversation.kind === 'group' && /general/i.test(conversation.title)
  );
  const showGeneralShortcut =
    !searchTerm && directoryMode !== 'unread' && !hasGeneralConversation;
  const visibleListCount = visibleDirectoryCount + (showGeneralShortcut ? 1 : 0);
  const directoryItems = useMemo<DirectoryListItem[]>(() => {
    const items: DirectoryListItem[] = [];

    if (showGeneralShortcut) {
      items.push({ type: 'generalShortcut', id: 'general-shortcut' });
    }

    visibleConversations.forEach((conversation) => {
      items.push({ type: 'conversation', id: `conversation-${conversation.id}`, conversation });
    });
    visibleContacts.forEach((contact) => {
      items.push({ type: 'contact', id: `contact-${contact.id}`, contact });
    });

    if (!items.length) {
      items.push({ type: 'empty', id: 'empty-directory' });
    }

    return items;
  }, [showGeneralShortcut, visibleContacts, visibleConversations]);
  const directoryHelperText = searchTerm
    ? `${visibleListCount} resultados para "${search.trim()}".`
    : directoryMode === 'priority'
      ? `${visibleListCount} conversaciones prioritarias.`
      : directoryMode === 'unread'
        ? `${visibleListCount} conversaciones no leidas.`
        : `${visibleListCount} conversaciones.`;

  return {
    activeContact,
    activeConversation,
    activeConversationKey,
    activeMessageItems,
    activeMessages,
    conversationFilterCounts,
    directoryHelperText,
    directoryItems,
    filteredContacts,
    searchTerm,
    visibleContacts,
    visibleListCount,
  };
}
