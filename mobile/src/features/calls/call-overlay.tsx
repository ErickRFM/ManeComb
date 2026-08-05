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
import { createNativeCallRuntime } from './call-runtime';
import type { CallMode, CallSocket } from './call-types';
import { ActiveCallModal } from './components/active-call-modal';
import { IncomingCallModal } from './components/incoming-call-modal';

setCallRuntimeFactory(createNativeCallRuntime);

type PushCallIntent = {
  key: string;
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string | null;
  mode: CallMode;
  action: 'incoming' | 'accept';
};

function parseQuery(raw: string): Record<string, string> {
  const query = raw.split('?')[1] || '';
  return Object.fromEntries(
    query
      .split('&')
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=');
        const key = separator >= 0 ? entry.slice(0, separator) : entry;
        const value = separator >= 0 ? entry.slice(separator + 1) : '';
        return [decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' '))];
      })
  );
}

export function parsePushCallIntent(url: string | null | undefined): PushCallIntent | null {
  const safeUrl = String(url || '').trim();
  if (!safeUrl || !safeUrl.toLowerCase().includes('/call')) return null;
  const params = parseQuery(safeUrl);
  const callId = String(params.callId || '').trim();
  const conversationId = String(params.conversationId || '').trim();
  const callerId = String(params.callerId || '').trim();
  if (!callId || !conversationId || !callerId) return null;
  const action = params.action === 'accept' ? 'accept' : 'incoming';
  const mode: CallMode = params.mode === 'video' ? 'video' : 'audio';

  return {
    key: `${callId}:${action}`,
    callId,
    conversationId,
    callerId,
    callerName: String(params.callerName || '').trim() || null,
    mode,
    action,
  };
}

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
