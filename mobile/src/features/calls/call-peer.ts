// RC-MOBILE-CALLS-PRODUCTION-01 Bloque C.5/C.6 — Reglas deterministas de negociacion y conexion.
// Puro/testeable. El peer nativo real lo maneja call-runtime; aqui viven las DECISIONES.

import type { CallDirection } from './call-types';

// C.5: el CALLER es el offerer canonico. NO se elige por orden lexicografico de socket id.
export function isCanonicalOfferer(direction: CallDirection): boolean {
  return direction === 'outgoing';
}

// C.6: CONNECTED exige las CUATRO condiciones simultaneas. Fuente unica de verdad.
export interface ConnectedInputs {
  participantCount: number;
  connectionState: string; // RTCPeerConnection.connectionState
  hasRemoteAudioTrack: boolean;
  remoteAudioTrackLive: boolean; // audioTrack.readyState === 'live'
}
export function evaluateConnected(input: ConnectedInputs): boolean {
  return (
    input.participantCount === 2 &&
    input.connectionState === 'connected' &&
    input.hasRemoteAudioTrack === true &&
    input.remoteAudioTrackLive === true
  );
}

// Conveniencia para derivar las señales de audio desde un stream remoto (o null).
export function remoteAudioSignals(remoteStream: {
  getAudioTracks?: () => Array<{ readyState?: string }>;
} | null): { hasRemoteAudioTrack: boolean; remoteAudioTrackLive: boolean } {
  const tracks = remoteStream && typeof remoteStream.getAudioTracks === 'function' ? remoteStream.getAudioTracks() : [];
  const first = tracks && tracks.length ? tracks[0] : null;
  return {
    hasRemoteAudioTrack: Boolean(first),
    remoteAudioTrackLive: Boolean(first && first.readyState === 'live'),
  };
}

// C.5: cola de candidatos ICE. Un candidato recibido antes de setRemoteDescription se conserva;
// tras aplicarla se drena en orden. Candidatos de OTRO callId se ignoran.
export interface IceQueue<C> {
  add(callId: string, candidate: C): boolean; // false si el callId no corresponde (ignorado)
  markRemoteReady(): void;
  drain(): C[]; // devuelve y vacia los pendientes en orden (solo si remote listo)
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
      if (!callId || candidateCallId !== callId) return false; // otra llamada -> ignorar
      pending.push(candidate);
      return true;
    },
    markRemoteReady() {
      remoteReady = true;
    },
    drain() {
      if (!remoteReady) return [];
      const out = pending.splice(0, pending.length);
      return out;
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
