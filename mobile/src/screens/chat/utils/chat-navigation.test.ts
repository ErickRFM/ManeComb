import type { ConversationSummary } from '@/src/types/app';
import {
  findDirectConversationId,
  shouldRestorePinnedConversation,
} from './chat-navigation';

function conversation(
  id: string,
  kind: 'direct' | 'group',
  participantIds: string[] = []
) {
  return {
    id,
    kind,
    channelMode: 'chat',
    participants: participantIds.map((participantId) => ({ id: participantId })),
  } as ConversationSummary;
}

describe('chat navigation coordination', () => {
  it('finds the direct conversation for the selected contact', () => {
    const conversations = [
      conversation('general', 'group'),
      conversation('direct-pepe', 'direct', ['me', 'pepe']),
    ];

    expect(findDirectConversationId(conversations, 'pepe')).toBe('direct-pepe');
  });

  it('restores a pinned direct chat when a late general response replaces it', () => {
    const conversations = [
      conversation('general', 'group'),
      conversation('direct-pepe', 'direct', ['me', 'pepe']),
    ];

    expect(
      shouldRestorePinnedConversation({
        activeConversationId: 'general',
        conversations,
        isCompact: true,
        mobilePane: 'conversation',
        pinnedConversationId: 'direct-pepe',
      })
    ).toBe(true);
  });

  it('does not restore after returning to the chat directory', () => {
    const conversations = [
      conversation('general', 'group'),
      conversation('direct-pepe', 'direct', ['me', 'pepe']),
    ];

    expect(
      shouldRestorePinnedConversation({
        activeConversationId: 'general',
        conversations,
        isCompact: true,
        mobilePane: 'directory',
        pinnedConversationId: 'direct-pepe',
      })
    ).toBe(false);
  });

  it('does not override a different direct conversation', () => {
    const conversations = [
      conversation('direct-pepe', 'direct', ['me', 'pepe']),
      conversation('direct-ana', 'direct', ['me', 'ana']),
    ];

    expect(
      shouldRestorePinnedConversation({
        activeConversationId: 'direct-ana',
        conversations,
        isCompact: true,
        mobilePane: 'conversation',
        pinnedConversationId: 'direct-pepe',
      })
    ).toBe(false);
  });
});
