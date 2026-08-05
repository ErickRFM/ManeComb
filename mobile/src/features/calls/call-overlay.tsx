import React, { useEffect } from 'react';

import { getSharedRealtimeSocket } from '@/src/store/root-store';
import { useAppStore } from '@/src/store/use-app-store';
import type { CallSocket } from './call-types';
import { setCallRuntimeFactory, useCallStore } from './call-store';
import { createNativeCallRuntime } from './call-runtime';
import { IncomingCallModal } from './components/incoming-call-modal';

setCallRuntimeFactory(createNativeCallRuntime);

export function CallOverlay(): React.ReactElement {
  const socketStatus = useAppStore((state) => state.socketStatus);
  const token = useAppStore((state) => state.token);
  const bindSocket = useCallStore((state) => state.bindSocket);

  useEffect(() => {
    const socket = getSharedRealtimeSocket() as unknown as CallSocket | null;
    bindSocket(socket ?? null);
  }, [bindSocket, socketStatus, token]);

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
