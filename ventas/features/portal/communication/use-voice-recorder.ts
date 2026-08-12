import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_VOICE_SECONDS = 60;

function pickMimeType() {
  if (!globalThis.MediaRecorder) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

export function usePortalVoiceRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopResolverRef = useRef<((value: { blob: Blob; durationSeconds: number } | null) => void) | null>(null);
  const cancelledRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const cleanup = () => {
    clearTimer();
    releaseStream();
    recorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;
    setRecording(false);
  };

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;
    return await new Promise<{ blob: Blob; durationSeconds: number } | null>((resolve) => {
      stopResolverRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else cleanup();
  }, []);

  const start = useCallback(async () => {
    if (recording) return false;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      setError('Este navegador no permite grabar notas de voz.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      startedAtRef.current = Date.now();
      setDurationSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setError('La grabación de audio se interrumpió.');
      recorder.onstop = () => {
        const elapsed = startedAtRef.current
          ? Math.max(1, Math.min(MAX_VOICE_SECONDS, Math.round((Date.now() - startedAtRef.current) / 1000)))
          : 1;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const result = !cancelledRef.current && blob.size > 0 ? { blob, durationSeconds: elapsed } : null;
        const resolver = stopResolverRef.current;
        stopResolverRef.current = null;
        cleanup();
        resolver?.(result);
      };

      recorder.start(500);
      setRecording(true);
      timerRef.current = setInterval(() => {
        const elapsed = startedAtRef.current
          ? Math.min(MAX_VOICE_SECONDS, Math.floor((Date.now() - startedAtRef.current) / 1000))
          : 0;
        setDurationSeconds(elapsed);
        if (elapsed >= MAX_VOICE_SECONDS && recorder.state !== 'inactive') recorder.stop();
      }, 250);
      return true;
    } catch (cause) {
      cleanup();
      const name = cause instanceof DOMException ? cause.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Permite el micrófono en el navegador para grabar audio.'
          : 'No fue posible iniciar el micrófono.'
      );
      return false;
    }
  }, [recording]);

  useEffect(() => () => {
    cancelledRef.current = true;
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    } catch {
      // best effort
    }
    cleanup();
  }, []);

  return {
    recording,
    durationSeconds,
    error,
    maxSeconds: MAX_VOICE_SECONDS,
    start,
    stop,
    cancel,
  };
}
