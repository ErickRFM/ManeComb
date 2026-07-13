import type { ChatDirectoryContact, ChatMessage, ConversationSummary } from '@/src/types/app';

export type DirectoryMode = 'all' | 'priority' | 'unread';
export type MobilePane = 'directory' | 'conversation';
export type RecordingState = 'idle' | 'recording' | 'uploading';
export type CallMode = 'audio' | 'video';
export type CallPhase = 'waiting' | 'connecting' | 'connected' | 'reconnecting';
export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type LocalTextMessage = ChatMessage & {
  localStatus: 'sending' | 'failed';
  retryText: string;
};
export type RtcParticipant = {
  socketId: string;
  userId: string;
  name: string;
};
export type CallSession = {
  roomId: string;
  mode: CallMode;
  phase: CallPhase;
  joinedAt: number;
  remoteStream: MediaStream | null;
  remoteSocketId: string | null;
};
export type DirectoryListItem =
  | { type: 'generalShortcut'; id: string }
  | { type: 'conversation'; id: string; conversation: ConversationSummary }
  | { type: 'contact'; id: string; contact: ChatDirectoryContact }
  | { type: 'empty'; id: string };
export type MessageListItem =
  | { type: 'date'; id: string; label: string }
  | { type: 'message'; id: string; message: ChatMessage };
export const MAX_VOICE_NOTE_SECONDS = 45;
