export type RecordingState = 'idle' | 'recording' | 'uploading' | 'sent' | 'error';
export type AudioPermissionState = 'unknown' | 'granted' | 'denied';
export type AudioFilter = 'all' | 'current' | 'mine';
export type RadioPageIndex = 0 | 1 | 2;

export type RadioOperationalPhase =
  | 'IDLE'
  | 'CONNECTING'
  | 'READY'
  | 'RECORDING'
  | 'UPLOADING'
  | 'LOADING'
  | 'BUFFERING'
  | 'PLAYING'
  | 'PAUSED'
  | 'FINISHED'
  | 'ERROR'
  | 'OFFLINE';

export type VoicePlaybackPhase =
  | 'IDLE'
  | 'LOADING'
  | 'BUFFERING'
  | 'PLAYING'
  | 'PAUSED'
  | 'FINISHED'
  | 'ERROR';

export type VoicePlaybackChangeMeta = {
  audioId?: string | null;
  elapsedMs?: number;
  reason: string;
  uri?: string | null;
};

export type ActivePlaybackState = {
  messageId: string;
  phase: VoicePlaybackPhase;
  updatedAt: number;
} | null;

export type RadioMetrics = {
  cancelled: number;
  playbackCount: number;
  playbackTotalMs: number;
  received: number;
  reconnects: number;
  sent: number;
  uploadCount: number;
  uploadTotalMs: number;
};
