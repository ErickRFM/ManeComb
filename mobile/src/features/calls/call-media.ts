// RC-MOBILE-CALLS-PRODUCTION-01 Bloque C.8 — Media local (microfono). El acceso nativo se aisla
// aqui; el mute es una operacion pura sobre track.enabled.

import { mediaDevices } from '@/src/native/webrtc';

export interface LocalMedia {
  stream: any; // MediaStream nativo
  audioTracks: Array<{ enabled: boolean; stop: () => void; readyState?: string }>;
}

// Obtiene audio (video opcional). Lanza si no hay permiso/dispositivo; el caller decide el fallback
// (NO aceptar la llamada, emitir rechazo tecnico sanitizado).
export async function acquireLocalMedia(mode: 'audio' | 'video'): Promise<LocalMedia> {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw new Error('media_unavailable');
  }
  const stream: any = await mediaDevices.getUserMedia({
    audio: true,
    video: mode === 'video',
  });
  const audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
  return { stream, audioTracks };
}

// C.8: mute/unmute alterna track.enabled del audio local. Puro/testeable.
export function setMicEnabled(media: LocalMedia | null, enabled: boolean): void {
  if (!media) return;
  media.audioTracks.forEach((track) => {
    track.enabled = enabled;
  });
}

// Detiene todas las pistas locales (no debe quedar microfono abierto tras colgar/logout).
export function stopLocalMedia(media: LocalMedia | null): void {
  if (!media) return;
  media.audioTracks.forEach((track) => {
    try {
      track.stop();
    } catch {
      // best-effort
    }
  });
  const stream = media.stream;
  if (stream && typeof stream.getTracks === 'function') {
    stream.getTracks().forEach((track: any) => {
      try {
        track.stop();
      } catch {
        // best-effort
      }
    });
  }
}
