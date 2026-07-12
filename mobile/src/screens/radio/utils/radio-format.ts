import type { ChatDirectoryContact, ConversationSummary } from '@/src/types/app';
import { formatClockDurationFromSeconds } from '@/src/utils/format';

export const formatDuration = formatClockDurationFromSeconds;

export function getConversationContact(
  conversation: ConversationSummary,
  currentUserId?: string | null
) {
  return (
    conversation.participants.find((participant) => participant.id !== currentUserId) ||
    conversation.participants[0] ||
    null
  );
}

export function getConversationPreview(conversation: ConversationSummary) {
  if (!conversation.lastMessage) {
    return 'Listo para transmitir.';
  }

  return (
    conversation.lastMessage.transcript ||
    conversation.lastMessage.textPreview ||
    conversation.lastMessage.text ||
    'Audio operativo reciente'
  );
}

export function getContactSearchText(contact: ChatDirectoryContact) {
  return `${contact.name} ${contact.email} ${contact.phone} ${contact.role}`.toLowerCase();
}

export function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function getProgressBarFill(progress: number, index: number, barCount: number) {
  const rawFill = progress * barCount - index;
  return rawFill <= 0 ? 0 : rawFill >= 1 ? 1 : rawFill;
}
