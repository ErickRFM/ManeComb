// RC-RTC-FINALIZATION-20260805 — Overlay global de llamadas.
// Enlaza el unico socket, monta timbre + llamada activa y gobierna el foreground service Android.
// RC-OPERATIONAL-RUNTIME-01 añade Radio global como runtime hermano, sin alterar ownership RTC.

import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { RadioLiveOverlay } from '@/src/features/radio-live/radio-live-overlay';
import { getSharedRealtimeSocket, useAppStore } from '@/src/store/root-store';
import {
  resetCallForegroundService,
  setCallForegroundServiceMode,
} from './call-foreground-service';
import { setCallRuntimeFactory, useCallStore } from './call-store';
import { createNativeCallRuntime } from './call-runtime';
import type { CallSocket } from './call-types';
import { ActiveCallModal } from './components/active-call-modal';
import { IncomingCallModal } from './components/incoming-call-modal';

setCallRuntimeFactory(createNativeCallRuntime);

export function CallOverlay(): React.ReactElement {
  const { socketStatus, token, userId } = useAppStore(
    useShallow((state) => ({
      socketStatus: state.socketStatus,
      token: state.token,
      userId: state.user?.id || null,
    }))
  );
  const socket = getSharedRealtimeSocket() as unknown as CallSocket | null;
  const bindSocket = useCallStore((state) => state.bindSocket);
  const phase = useCallStore((state) => state.phase);
  const mode = useCallStore((state) => state.mode);

  // socketStatus/token/userId make this overlay reactive to root-store socket
  // replacement. bindSocket performs exact listener cleanup when the instance changes.
  useEffect(() => {
    bindSocket(socket ?? null);
  }, [bindSocket, socket, socketStatus, token, userId]);

  const needsForegroundService =
    phase === 'CONNECTING' ||
    phase === 'CONNECTED' ||
    phase === 'RECONNECTING';

  // Do not use an effect cleanup for phase transitions: React runs cleanup before
  // the next effect and that used to cross stop/start during rapid call changes.
  useEffect(() => {
    setCallForegroundServiceMode(
      needsForegroundService ? (mode === 'video' ? 'video' : 'audio') : null
    ).catch(() => undefined);
  }, [mode, needsForegroundService]);

  useEffect(
    () => () => {
      const store = useCallStore.getState();
      store.unbindSocket();
      store.reset();
      resetCallForegroundService().catch(() => undefined);
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
