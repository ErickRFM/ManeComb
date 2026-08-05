import type {
  ConversationChannelMode,
  ConversationSummary,
} from '@/src/types/app';
import type { MobilePane } from '../types';

export function findDirectConversationId(
  conversations: ConversationSummary[],
  contactId: string,
  channelMode: ConversationChannelMode = 'chat'
) {
  return conversations.find(
    (conversation) =>
      conversation.kind === 'direct' &&
      conversation.channelMode === channelMode &&
      conversation.participants.some((participant) => participant.id === contactId)
  )?.id || null;
}

export function shouldRestorePinnedConversation(input: {
  activeConversationId: string | null;
  conversations: ConversationSummary[];
  isCompact: boolean;
  mobilePane: MobilePane;
  pinnedConversationId: string | null;
}) {
  if (
    !input.isCompact ||
    input.mobilePane !== 'conversation' ||
    !input.pinnedConversationId ||
    input.activeConversationId === input.pinnedConversationId
  ) {
    return false;
  }

  const pinnedConversation = input.conversations.find(
    (conversation) => conversation.id === input.pinnedConversationId
  );
  const activeConversation = input.conversations.find(
    (conversation) => conversation.id === input.activeConversationId
  );

  if (
    pinnedConversation?.kind !== 'direct' ||
    pinnedConversation.channelMode !== 'chat'
  ) {
    return false;
  }

  return (
    !activeConversation ||
    (activeConversation.kind === 'group' && activeConversation.channelMode === 'chat')
  );
}
