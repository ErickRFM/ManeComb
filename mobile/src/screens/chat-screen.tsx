import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { ConversationChannelMode } from '@/src/types/app';
import { useCallStore } from '@/src/features/calls/call-store';
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
    callNotice,
    handleOpenDirect: openDirectConversation,
    handleOpenGeneral: openGeneralConversation,
    handleSelectConversation: selectConversation,
    isCompact,
    mobilePane,
    setCallNotice,
    setMobilePane: setControllerMobilePane,
  } = controller;
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const conversations = useAppStore((state) => state.conversations);
  const permissionPrompt = useCallStore((state) => state.permissionPrompt);
  const pinnedConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (permissionPrompt && callNotice) {
      // El modal global de permisos es la autoridad de recuperación. callNotice
      // también está en las dependencias para cubrir la carrera en la que
      // startCall devuelve media_permission_required después del primer render.
      setCallNotice(null);
    }
  }, [callNotice, permissionPrompt, setCallNotice]);

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
