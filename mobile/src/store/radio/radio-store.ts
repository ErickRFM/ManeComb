import { useAppStore } from '../root-store';
import type { AppState } from '../root-store';

export const selectRadioState = (state: AppState) => ({
  activeConversationId: state.activeConversationId,
  conversations: state.conversations.filter((conversation) => conversation.channelMode === 'radio'),
  loadConversation: state.loadConversation,
  messagesByConversation: state.messagesByConversation,
  openGeneralConversation: state.openGeneralConversation,
  sendMediaMessage: state.sendMediaMessage,
  sendVoiceMessage: state.sendVoiceMessage,
  setActiveConversationId: state.setActiveConversationId,
});

export function useRadioStore<T>(selector: (state: AppState) => T) {
  return useAppStore(selector);
}
