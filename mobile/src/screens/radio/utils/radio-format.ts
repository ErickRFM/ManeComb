import type { ChatDirectoryContact, ConversationSummary } from '@/src/types/app';
import { formatClockDurationFromSeconds } from '@/src/utils/format';
import { RADIO_PHASE_TRANSITIONS } from '../constants';
import type { RadioMetrics, RadioOperationalPhase, VoicePlaybackPhase } from '../types';

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

export function getFirstName(name?: string | null) {
  return String(name || '').trim().split(/\s+/)[0] || null;
}

export function isLivePlaybackPhase(phase?: VoicePlaybackPhase | null) {
  return phase === 'LOADING' || phase === 'BUFFERING' || phase === 'PLAYING';
}

export function isDevelopmentRuntime() {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
}

export function logRadioDevelopmentEvent(
  scope: 'radio-state' | 'radio-player',
  event: Record<string, unknown>
) {
  if (!isDevelopmentRuntime()) {
    return;
  }

  console.info(`[${scope}]`, {
    ...event,
    timestamp: new Date().toISOString(),
  });
}

export function isValidRadioPhaseTransition(
  previous: RadioOperationalPhase,
  next: RadioOperationalPhase
) {
  return previous === next || RADIO_PHASE_TRANSITIONS[previous]?.includes(next);
}

export function getAverageDuration(totalMs: number, count: number) {
  return count > 0 ? Math.round(totalMs / count) : 0;
}

export function createInitialRadioMetrics(): RadioMetrics {
  return {
    cancelled: 0,
    playbackCount: 0,
    playbackTotalMs: 0,
    received: 0,
    reconnects: 0,
    sent: 0,
    uploadCount: 0,
    uploadTotalMs: 0,
  };
}
