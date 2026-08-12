import { useEffect, useState } from 'react';
import { loadAuthenticatedCommunicationAsset } from './api';

type Props = {
  kind: 'audio' | 'image' | 'video';
  source: string;
  alt?: string;
};

export function AuthenticatedCommunicationMedia({ kind, source, alt = '' }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setError(false);
    setObjectUrl(null);

    void loadAuthenticatedCommunicationAsset(source)
      .then((nextUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        url = nextUrl;
        setObjectUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attempt, source]);

  if (error) {
    return (
      <button className="portal-comms-message-error" type="button" onClick={() => setAttempt((value) => value + 1)}>
        No se pudo cargar · Reintentar
      </button>
    );
  }

  if (!objectUrl) return <span className="portal-comms-message-meta">Cargando…</span>;

  if (kind === 'image') {
    return <img className="portal-comms-message-media" src={objectUrl} alt={alt || 'Imagen enviada'} />;
  }

  if (kind === 'video') {
    return <video className="portal-comms-message-media" src={objectUrl} controls playsInline preload="metadata" />;
  }

  return <audio src={objectUrl} controls preload="metadata" />;
}
