// RC-RTC-FINALIZATION-20260805 — Overlay global de llamadas.
// Enlaza el unico socket, monta timbre + llamada activa y gobierna el foreground service Android.
// RC-OPERATIONAL-RUNTIME-01 añade Radio global como runtime hermano, sin alterar ownership RTC.

import React, { useEffect } from 'react';

import { RadioLiveOverlay } from '@/src/features/radio-live/radio-live-overlay';
import {
  startCallForegroundService,
  stopCallForegroundService,
} from '@/src/native/call-service';
import { getSharedRealtimeSocket } from '@/src/store/root-store';
import { setCallRuntimeFactory, useCallStore } from './call-store';
import { createNativeCallRuntime } from './call-runtime';
import type { CallSocket } from './call-types';
import { ActiveCallModal } from './components/active-call-modal';
import { IncomingCallModal } from './components/incoming-call-modal';

setCallRuntimeFactory(createNativeCallRuntime);

export function CallOverlay(): React.ReactElement {
  const socket = getSharedRealtimeSocket() as unknown as CallSocket | null;
  const bindSocket = useCallStore((state) => state.bindSocket);
  const phase = useCallStore((state) => state.phase);
  const mode = useCallStore((state) => state.mode);

  useEffect(() => {
    bindSocket(socket ?? null);
  }, [socket, bindSocket]);

  const needsForegroundService =
    phase === 'CONNECTING' ||
    phase === 'CONNECTED' ||
    phase === 'RECONNECTING';

  useEffect(() => {
    if (!needsForegroundService) {
      stopCallForegroundService().catch(() => undefined);
      return undefined;
    }

    startCallForegroundService(mode === 'video').catch(() => undefined);
    return () => {
      stopCallForegroundService().catch(() => undefined);
    };
  }, [mode, needsForegroundService]);

  useEffect(
    () => () => {
      const store = useCallStore.getState();
      store.unbindSocket();
      store.reset();
      stopCallForegroundService().catch(() => undefined);
    },
    []
  );

  return (
    <>
      <RadioLiveOverlay />
      <IncomingCallModal />
      <ActiveCallModal />
    </>
  );
}
