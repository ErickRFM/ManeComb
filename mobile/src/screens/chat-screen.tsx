import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { ConversationChannelMode } from '@/src/types/app';
import { useAppStore } from '@/src/store/use-app-store';
import { ChatScreenView } from './chat/components/chat-screen-view';
import { useChatController } from './chat/hooks/use-chat-controller';
import type { MobilePane } from './chat/types';
import {
  findDirectConversationId,
  shouldRestorePinnedConversation,
} from './chat/utils/chat-navigation';

export function ChatScreen() {
  const controller = useChatController();
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
        isCompact: controller.isCompact,
        mobilePane: controller.mobilePane,
        pinnedConversationId: pinnedConversationIdRef.current,
      })
    ) {
      controller.setActiveConversationId(pinnedConversationIdRef.current!);
    }
  }, [
    activeConversationId,
    conversations,
    controller.isCompact,
    controller.mobilePane,
    controller.setActiveConversationId,
  ]);

  const setMobilePane = useCallback(
    (pane: MobilePane) => {
      if (pane === 'directory') {
        pinnedConversationIdRef.current = null;
      } else if (activeConversationId) {
        pinnedConversationIdRef.current = activeConversationId;
      }

      controller.setMobilePane(pane);
    },
    [activeConversationId, controller.setMobilePane]
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      pinnedConversationIdRef.current = conversationId;
      controller.handleSelectConversation(conversationId);
    },
    [controller.handleSelectConversation]
  );

  const handleOpenGeneral = useCallback(
    async (channelMode: ConversationChannelMode) => {
      pinnedConversationIdRef.current = null;
      await controller.handleOpenGeneral(channelMode);
      pinnedConversationIdRef.current = useAppStore.getState().activeConversationId;
    },
    [controller.handleOpenGeneral]
  );

  const handleOpenDirect = useCallback(
    async (
      contactId: string,
      channelMode: ConversationChannelMode = 'chat'
    ) => {
      await controller.handleOpenDirect(contactId, channelMode);

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
      if (controller.isCompact) {
        controller.setMobilePane('conversation');
      }
    },
    [
      controller.handleOpenDirect,
      controller.isCompact,
      controller.setMobilePane,
    ]
  );

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !controller.isCompact ||
      controller.mobilePane !== 'conversation'
    ) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMobilePane('directory');
      return true;
    });

    return () => subscription.remove();
  }, [controller.isCompact, controller.mobilePane, setMobilePane]);

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
