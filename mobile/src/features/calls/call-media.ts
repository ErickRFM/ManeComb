// Media local de llamadas. Este modulo es la unica frontera que abre y controla
// microfono/camara para el runtime global.

import { mediaDevices } from '@/src/native/webrtc';

export interface LocalMedia {
  stream: any;
  audioTracks: Array<{ enabled: boolean; stop: () => void; readyState?: string }>;
  videoTracks: Array<{ enabled: boolean; stop: () => void; readyState?: string }>;
}

export async function acquireLocalMedia(mode: 'audio' | 'video'): Promise<LocalMedia> {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw new Error('media_unavailable');
  }

  const stream: any = await mediaDevices.getUserMedia({
    audio: true,
    video: mode === 'video',
  });
  const audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
  const videoTracks = typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : [];

  if (!audioTracks.length) {
    stream.getTracks?.().forEach((track: any) => track.stop?.());
    throw new Error('microphone_unavailable');
  }
  if (mode === 'video' && !videoTracks.length) {
    stream.getTracks?.().forEach((track: any) => track.stop?.());
    throw new Error('camera_unavailable');
  }

  return { stream, audioTracks, videoTracks };
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
  const stopped = new Set<unknown>();
  const stopTrack = (track: any) => {
    if (!track || stopped.has(track)) return;
    stopped.add(track);
    try {
      track.stop?.();
    } catch {
      // cleanup best-effort
    }
  };

  media.audioTracks.forEach(stopTrack);
  media.videoTracks.forEach(stopTrack);
  media.stream?.getTracks?.().forEach(stopTrack);
}
