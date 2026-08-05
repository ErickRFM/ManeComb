// RC-RTC-FINALIZATION-20260805 — Captura y controles de media local.
// El runtime es el unico propietario del stream; este modulo solo crea, conmuta y libera tracks.

import { mediaDevices } from '@/src/native/webrtc';

export interface LocalMediaTrack {
  enabled: boolean;
  stop: () => void;
  readyState?: string;
  kind?: string;
}

export interface LocalMedia {
  stream: any;
  audioTracks: LocalMediaTrack[];
  videoTracks: LocalMediaTrack[];
  allTracks: LocalMediaTrack[];
}

function listTracks(stream: any, method: 'getAudioTracks' | 'getVideoTracks' | 'getTracks'):
  LocalMediaTrack[] {
  return stream && typeof stream[method] === 'function' ? stream[method]() : [];
}

export async function acquireLocalMedia(mode: 'audio' | 'video'): Promise<LocalMedia> {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw new Error('media_unavailable');
  }

  const stream: any = await mediaDevices.getUserMedia({
    audio: true,
    video: mode === 'video',
  });
  const audioTracks = listTracks(stream, 'getAudioTracks');
  const videoTracks = listTracks(stream, 'getVideoTracks');
  const allTracks = listTracks(stream, 'getTracks');

  if (!audioTracks.length) {
    allTracks.forEach((track) => {
      try {
        track.stop();
      } catch {
        // best-effort
      }
    });
    throw new Error('audio_track_unavailable');
  }

  if (mode === 'video' && !videoTracks.length) {
    allTracks.forEach((track) => {
      try {
        track.stop();
      } catch {
        // best-effort
      }
    });
    throw new Error('video_track_unavailable');
  }

  return {
    stream,
    audioTracks,
    videoTracks,
    allTracks: allTracks.length ? allTracks : [...audioTracks, ...videoTracks],
  };
}

export function setMicEnabled(media: LocalMedia | null, enabled: boolean): void {
  media?.audioTracks.forEach((track) => {
    track.enabled = enabled;
  });
}

export function setCameraEnabled(media: LocalMedia | null, enabled: boolean): void {
  media?.videoTracks.forEach((track) => {
    track.enabled = enabled;
  });
}

export function stopLocalMedia(media: LocalMedia | null): void {
  if (!media) return;

  const uniqueTracks = new Set<LocalMediaTrack>(media.allTracks);
  media.audioTracks.forEach((track) => uniqueTracks.add(track));
  media.videoTracks.forEach((track) => uniqueTracks.add(track));

  uniqueTracks.forEach((track) => {
    try {
      track.stop();
    } catch {
      // Cerrar una pista nunca debe bloquear el cleanup de las demas.
    }
  });
}
