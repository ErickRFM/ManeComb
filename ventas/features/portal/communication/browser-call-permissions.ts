import type { CallMode } from '@shared/communication';

export type BrowserCallPermissionResult = {
  ok: boolean;
  code?: string;
};

function permissionFailureCode(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'media_permission_denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'media_device_unavailable';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'media_device_busy';
  return 'media_capture_failed';
}

/**
 * El preflight ocurre antes de rtc:call/rtc:accept para no hacer timbrar al peer
 * cuando este navegador no puede aportar el medio requerido. Las pistas se
 * liberan inmediatamente; el runtime definitivo las adquiere al conectar.
 */
export async function preflightBrowserCallMedia(mode: CallMode): Promise<BrowserCallPermissionResult> {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
    return { ok: false, code: 'webrtc_unavailable' };
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video',
    });
    const hasLiveAudio = stream.getAudioTracks().some((track) => track.readyState === 'live');
    const hasLiveVideo = mode !== 'video' || stream.getVideoTracks().some((track) => track.readyState === 'live');
    if (!hasLiveAudio) return { ok: false, code: 'microphone_unavailable' };
    if (!hasLiveVideo) return { ok: false, code: 'camera_unavailable' };
    return { ok: true };
  } catch (error) {
    return { ok: false, code: permissionFailureCode(error) };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}
