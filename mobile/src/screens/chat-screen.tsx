import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { ConversationChannelMode } from '@/src/types/app';
import { useAppStore } from '@/src/store/use-app-store';
import { ChatScreenView } from './chat/components/chat-screen-view';
import { useChatController } from './chat/hooks/use-chat-controller';
import {
  findDirectConversationId,
  shouldRestorePinnedConversation,
} from './chat/utils/chat-navigation';

export function ChatScreen() {
  const controller = useChatController();
  const {
    handleOpenDirect: openDirectConversation,
    handleOpenGeneral: openGeneralConversation,
    handleSelectConversation: selectConversation,
    isCompact,
    mobilePane,
    setMobilePane: setControllerMobilePane,
  } = controller;
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const conversations = useAppStore((state) => state.conversations);
  const pinnedConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const activeConversation = conversations.find(
      (conversation) => conversation.id === activeConversationId
    );

    if (
      activeConversation?.kind === 'direct' &&
      activeConversation.channelMode === 'chat'
    ) {
      pinnedConversationIdRef.current = activeConversation.id;
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (
      shouldRestorePinnedConversation({
        activeConversationId,
        conversations,
        isCompact,
        mobilePane,
        pinnedConversationId: pinnedConversationIdRef.current,
      })
    ) {
      useAppStore
        .getState()
        .setActiveConversationId(pinnedConversationIdRef.current!);
    }
  }, [activeConversationId, conversations, isCompact, mobilePane]);

  const setMobilePane = useCallback(
    (value: Parameters<typeof setControllerMobilePane>[0]) => {
      const pane = typeof value === 'function'
        ? value(mobilePane)
        : value;

      if (pane === 'directory') {
        pinnedConversationIdRef.current = null;
      } else if (activeConversationId) {
        pinnedConversationIdRef.current = activeConversationId;
      }

      setControllerMobilePane(value);
    },
    [activeConversationId, mobilePane, setControllerMobilePane]
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      pinnedConversationIdRef.current = conversationId;
      selectConversation(conversationId);
    },
    [selectConversation]
  );

  const handleOpenGeneral = useCallback(
    async (channelMode: ConversationChannelMode) => {
      pinnedConversationIdRef.current = null;
      await openGeneralConversation(channelMode);
      pinnedConversationIdRef.current = useAppStore.getState().activeConversationId;
    },
    [openGeneralConversation]
  );

  const handleOpenDirect = useCallback(
    async (
      contactId: string,
      channelMode: ConversationChannelMode = 'chat'
    ) => {
      await openDirectConversation(contactId, channelMode);

      const state = useAppStore.getState();
      const directConversationId = findDirectConversationId(
        state.conversations,
        contactId,
        channelMode
      );

      if (!directConversationId) {
        return;
      }

      pinnedConversationIdRef.current = directConversationId;
      if (state.activeConversationId !== directConversationId) {
        state.setActiveConversationId(directConversationId);
      }
      if (isCompact) {
        setControllerMobilePane('conversation');
      }
    },
    [isCompact, openDirectConversation, setControllerMobilePane]
  );

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !isCompact ||
      mobilePane !== 'conversation'
    ) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMobilePane('directory');
      return true;
    });

    return () => subscription.remove();
  }, [isCompact, mobilePane, setMobilePane]);

  return (
    <ChatScreenView
      {...controller}
      handleOpenDirect={handleOpenDirect}
      handleOpenGeneral={handleOpenGeneral}
      handleSelectConversation={handleSelectConversation}
      setMobilePane={setMobilePane}
    />
  );
}
