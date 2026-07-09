import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectChatState = (state: AppState) => ({
  activeConversationId: state.activeConversationId,
  chatContacts: state.chatContacts,
  conversations: state.conversations.filter((conversation) => conversation.channelMode !== 'radio'),
  loadChatContacts: state.loadChatContacts,
  loadConversation: state.loadConversation,
  messagesByConversation: state.messagesByConversation,
  openDirectConversation: state.openDirectConversation,
  openGeneralConversation: state.openGeneralConversation,
  sendMediaMessage: state.sendMediaMessage,
  sendMessage: state.sendMessage,
  sendVoiceMessage: state.sendVoiceMessage,
  setActiveConversationId: state.setActiveConversationId,
});

export function useChatStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
