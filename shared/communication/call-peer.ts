import type { CallDirection } from './call-types';

export function isCanonicalOfferer(direction: CallDirection): boolean {
  return direction === 'outgoing';
}

export interface ConnectedInputs {
  participantCount: number;
  connectionState: string;
  hasRemoteAudioTrack: boolean;
  remoteAudioTrackLive: boolean;
}

export function evaluateConnected(input: ConnectedInputs): boolean {
  return (
    input.participantCount === 2 &&
    input.connectionState === 'connected' &&
    input.hasRemoteAudioTrack === true &&
    input.remoteAudioTrackLive === true
  );
}

export function remoteAudioSignals(remoteStream: {
  getAudioTracks?: () => Array<{ readyState?: string }>;
} | null): { hasRemoteAudioTrack: boolean; remoteAudioTrackLive: boolean } {
  const tracks = remoteStream && typeof remoteStream.getAudioTracks === 'function'
    ? remoteStream.getAudioTracks()
    : [];
  const first = tracks && tracks.length ? tracks[0] : null;
  return {
    hasRemoteAudioTrack: Boolean(first),
    remoteAudioTrackLive: Boolean(first && first.readyState === 'live'),
  };
}

export interface IceQueue<C> {
  add(callId: string, candidate: C): boolean;
  markRemoteReady(): void;
  drain(): C[];
  reset(callId: string | null): void;
  size(): number;
  isRemoteReady(): boolean;
}

export function createIceQueue<C = unknown>(initialCallId: string | null = null): IceQueue<C> {
  let callId = initialCallId;
  let remoteReady = false;
  const pending: C[] = [];
  return {
    add(candidateCallId, candidate) {
      if (!callId || candidateCallId !== callId) return false;
      pending.push(candidate);
      return true;
    },
    markRemoteReady() {
      remoteReady = true;
    },
    drain() {
      if (!remoteReady) return [];
      return pending.splice(0, pending.length);
    },
    reset(nextCallId) {
      callId = nextCallId;
      remoteReady = false;
      pending.splice(0, pending.length);
    },
    size() {
      return pending.length;
    },
    isRemoteReady() {
      return remoteReady;
    },
  };
}
