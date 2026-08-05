// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Overlay global: enlaza el socket compartido al store
// de llamadas y monta el modal por encima de los navegadores. Se re-vincula si cambia la instancia
// del socket (re-auth); en un reconnect (misma instancia) NO re-registra listeners.

import React, { useEffect } from 'react';

import { getSharedRealtimeSocket } from '@/src/store/root-store';
import type { CallSocket } from './call-types';
import { useCallStore } from './call-store';
import { IncomingCallModal } from './components/incoming-call-modal';

export function CallOverlay(): React.ReactElement {
  const socket = getSharedRealtimeSocket() as unknown as CallSocket | null;
  const bindSocket = useCallStore((s) => s.bindSocket);

  useEffect(() => {
    bindSocket(socket ?? null);
  }, [socket, bindSocket]);

  // Al desmontar (logout / cambio de usuario / cierre), soltar listeners y limpiar la llamada.
  useEffect(
    () => () => {
      const store = useCallStore.getState();
      store.unbindSocket();
      store.reset();
    },
    []
  );

  return <IncomingCallModal />;
}
