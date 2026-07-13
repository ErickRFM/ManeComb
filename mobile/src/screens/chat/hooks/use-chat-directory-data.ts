import { useMemo } from 'react';
import type {
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
  getConversationContact,
  getConversationLastActivityTime,
  isPriorityConversation,
} from '../utils/conversation';

type UseChatDirectoryDataOptions = {
  activeConversationId: string | null;
  chatConversations: ConversationSummary[];
  directoryMode: DirectoryMode;
  messagesByConversation: Record<string, ChatMessage[]>;
  pendingTextMessages: LocalTextMessage[];
  userId?: string | null;
};

export function useChatDirectoryData({
  activeConversationId,
  chatConversations,
  directoryMode,
  messagesByConversation,
  pendingTextMessages,
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

      return true;
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
  }, [activeConversationId, chatConversations, directoryMode]);
  const visibleConversations = filteredConversations;
  const visibleDirectoryCount = visibleConversations.length;
  const hasGeneralConversation = filteredConversations.some(
    (conversation) => conversation.kind === 'group' && /general/i.test(conversation.title)
  );
  const showGeneralShortcut =
    directoryMode !== 'unread' && !hasGeneralConversation;
  const visibleListCount = visibleDirectoryCount + (showGeneralShortcut ? 1 : 0);
  const directoryItems = useMemo<DirectoryListItem[]>(() => {
    const items: DirectoryListItem[] = [];

    if (showGeneralShortcut) {
      items.push({ type: 'generalShortcut', id: 'general-shortcut' });
    }

    visibleConversations.forEach((conversation) => {
      items.push({ type: 'conversation', id: `conversation-${conversation.id}`, conversation });
    });
    if (!items.length) {
      items.push({ type: 'empty', id: 'empty-directory' });
    }

    return items;
  }, [showGeneralShortcut, visibleConversations]);
  const directoryHelperText = directoryMode === 'priority'
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
    visibleListCount,
  };
}
