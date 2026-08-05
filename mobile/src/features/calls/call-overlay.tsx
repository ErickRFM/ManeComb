// RC-RTC-FINALIZATION-20260805 — Overlay global de llamadas.
// RC-PUSH-CALLS-ANDROID-01 — rehidrata callId desde notificacion con la app cerrada.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { RadioLiveOverlay } from '@/src/features/radio-live/radio-live-overlay';
import {
  startCallForegroundService,
  stopCallForegroundService,
} from '@/src/native/call-service';
import { getSharedRealtimeSocket } from '@/src/store/root-store';
import { useAppStore } from '@/src/store/use-app-store';
import { setCallRuntimeFactory, useCallStore } from './call-store';
import { parsePushCallIntent, type PushCallIntent } from './call-push-intent';
import { createNativeCallRuntime } from './call-runtime';
import type { CallSocket } from './call-types';
import { ActiveCallModal } from './components/active-call-modal';
import { IncomingCallModal } from './components/incoming-call-modal';

setCallRuntimeFactory(createNativeCallRuntime);

export function CallOverlay(): React.ReactElement {
  const socketStatus = useAppStore((state) => state.socketStatus);
  const bindSocket = useCallStore((state) => state.bindSocket);
  const phase = useCallStore((state) => state.phase);
  const mode = useCallStore((state) => state.mode);
  const [pendingPushCall, setPendingPushCall] = useState<PushCallIntent | null>(null);
  const consumedPushCalls = useRef(new Set<string>());

  const receivePushUrl = useCallback((url: string | null | undefined) => {
    const intent = parsePushCallIntent(url);
    if (!intent || consumedPushCalls.current.has(intent.key)) return;
    setPendingPushCall(intent);
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(receivePushUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => receivePushUrl(url));
    return () => subscription.remove();
  }, [receivePushUrl]);

  useEffect(() => {
    const socket = getSharedRealtimeSocket() as unknown as CallSocket | null;
    bindSocket(socket ?? null);
  }, [socketStatus, bindSocket]);

  useEffect(() => {
    if (!pendingPushCall || socketStatus !== 'connected') return;
    const socket = getSharedRealtimeSocket() as unknown as CallSocket | null;
    if (!socket) return;

    const store = useCallStore.getState();
    if (store.phase === 'IDLE') {
      store.handleIncoming({
        callId: pendingPushCall.callId,
        conversationId: pendingPushCall.conversationId,
        mode: pendingPushCall.mode,
        caller: {
          id: pendingPushCall.callerId,
          name: pendingPushCall.callerName,
        },
      });
    }

    if (useCallStore.getState().callId !== pendingPushCall.callId) {
      consumedPushCalls.current.add(pendingPushCall.key);
      setPendingPushCall(null);
      return;
    }

    consumedPushCalls.current.add(pendingPushCall.key);
    setPendingPushCall(null);
    if (pendingPushCall.action === 'accept') {
      void useCallStore.getState().acceptIncomingCall();
    }
  }, [pendingPushCall, socketStatus]);

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
