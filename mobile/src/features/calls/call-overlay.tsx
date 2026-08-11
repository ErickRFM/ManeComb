// RC-RTC-FINALIZATION-20260805 — Overlay global de llamadas.
// RC-MOBILE-RUNTIME-LIFECYCLE-02 — socket y foreground service con ownership serializado.
// RC-PUSH-CALLS-ANDROID-01 — rehidrata callId desde notificacion con la app cerrada.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState as NativeAppState, Linking, type AppStateStatus } from 'react-native';

import { RadioLiveOverlay } from '@/src/features/radio-live/radio-live-overlay';
import {
  setCallFeedbackMode,
  setIncomingCallWindowActive,
  type CallFeedbackMode,
} from '@/src/native/call-service';
import { useAppStore, useSharedRealtimeSocket } from '@/src/store/use-app-store';
import {
  resetCallForegroundService,
  setCallForegroundServiceMode,
} from './call-foreground-service';
import { setCallRuntimeFactory, useCallStore } from './call-store';
import { parsePushCallIntent, type PushCallIntent } from './call-push-intent';
import { createNativeCallRuntime } from './call-runtime';
import type { CallSocket } from './call-types';
import { ActiveCallModal } from './components/active-call-modal';
import { CallPermissionModal } from './components/call-permission-modal';
import { IncomingCallModal } from './components/incoming-call-modal';

setCallRuntimeFactory(createNativeCallRuntime);

export function CallOverlay(): React.ReactElement {
  const socketStatus = useAppStore((state) => state.socketStatus);
  const sharedSocket = useSharedRealtimeSocket();
  const socket = sharedSocket as unknown as CallSocket | null;
  const bindSocket = useCallStore((state) => state.bindSocket);
  const phase = useCallStore((state) => state.phase);
  const direction = useCallStore((state) => state.direction);
  const mode = useCallStore((state) => state.mode);
  const callId = useCallStore((state) => state.callId);
  const [pendingPushCall, setPendingPushCall] = useState<PushCallIntent | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(NativeAppState.currentState);
  const consumedPushCalls = useRef(new Set<string>());
  const dismissedCallIds = useRef(new Set<string>());
  const callWindowManaged = useRef(false);
  const feedbackMode = useRef<CallFeedbackMode>('none');
  const feedbackCallId = useRef<string | null>(null);

  const receivePushUrl = useCallback((url: string | null | undefined) => {
    const intent = parsePushCallIntent(url);
    if (!intent || consumedPushCalls.current.has(intent.key)) return;

    if (intent.action === 'dismiss') {
      consumedPushCalls.current.add(intent.key);
      dismissedCallIds.current.add(intent.callId);
      setPendingPushCall((current) => current?.callId === intent.callId ? null : current);
      setIncomingCallWindowActive(false).catch(() => undefined);

      const store = useCallStore.getState();
      if (store.callId === intent.callId) {
        if (intent.reason === 'accepted') {
          store.handleAccepted({ callId: intent.callId });
        } else if (intent.reason === 'timeout') {
          store.handleTimeout({ callId: intent.callId });
        } else if (
          intent.reason === 'cancelled' ||
          intent.reason === 'rejected' ||
          intent.reason === 'busy'
        ) {
          store.handleCancelled({ callId: intent.callId });
        } else {
          store.handleRemoteEnd({ callId: intent.callId, reason: intent.reason || undefined });
        }
      }
      return;
    }

    if (dismissedCallIds.current.has(intent.callId)) {
      consumedPushCalls.current.add(intent.key);
      return;
    }
    setPendingPushCall(intent);
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(receivePushUrl).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => receivePushUrl(url));
    return () => subscription.remove();
  }, [receivePushUrl]);

  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    bindSocket(socket);
  }, [bindSocket, socket]);

  useEffect(() => {
    if (!pendingPushCall || socketStatus !== 'connected' || !socket) return;
    if (dismissedCallIds.current.has(pendingPushCall.callId)) {
      consumedPushCalls.current.add(pendingPushCall.key);
      setPendingPushCall(null);
      return;
    }

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
        expiresAt: pendingPushCall.expiresAt || undefined,
        ringTimeoutMs: pendingPushCall.ringTimeoutMs || undefined,
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
      // El store aplica el mismo preflight que el botón de llamada. El accept
      // de un deep link no puede saltarse permisos ni adelantar CONNECTING.
      useCallStore.getState().acceptIncomingCall().catch(() => undefined);
    }
  }, [pendingPushCall, socket, socketStatus]);

  // Feedback de llamada, con una unica autoridad nativa. Incoming solo se inicia
  // desde React si la llamada llega mientras la app esta visible o cuando el
  // full-screen intent trae la app al frente. Una vez iniciado, sigue sonando si
  // el usuario manda la app a background hasta que la maquina salga de ringing.
  // Ringback pertenece al caller y puede continuar aunque este cambie de app.
  useEffect(() => {
    let nextFeedback: CallFeedbackMode = 'none';
    let nextFeedbackCallId: string | null = null;

    if (phase === 'OUTGOING_RINGING' && direction === 'outgoing') {
      nextFeedback = 'ringback';
    } else if (phase === 'INCOMING_RINGING' && direction === 'incoming' && callId) {
      const incomingAlreadyStarted = feedbackMode.current === 'incoming';
      if (appState === 'active' || incomingAlreadyStarted) {
        nextFeedback = 'incoming';
        nextFeedbackCallId = callId;
      }
    }

    if (
      feedbackMode.current === nextFeedback &&
      feedbackCallId.current === nextFeedbackCallId
    ) {
      return;
    }

    feedbackMode.current = nextFeedback;
    feedbackCallId.current = nextFeedbackCallId;
    setCallFeedbackMode(nextFeedback, nextFeedbackCallId).catch(() => undefined);
  }, [appState, callId, direction, phase]);

  // OUTGOING_RINGING sólo existe después del preflight. Mantener el FGS desde
  // aquí permite que una llamada iniciada en foreground continúe si el usuario
  // manda la app a segundo plano antes de que el receptor acepte. Incoming no
  // eleva el servicio durante ringing porque todavía puede estar sin permisos.
  const needsForegroundService =
    phase === 'OUTGOING_RINGING' ||
    phase === 'CONNECTING' ||
    phase === 'CONNECTED' ||
    phase === 'RECONNECTING';
  const needsIncomingCallWindow =
    direction === 'incoming' &&
    (
      phase === 'INCOMING_RINGING' ||
      phase === 'CONNECTING' ||
      phase === 'CONNECTED' ||
      phase === 'RECONNECTING'
    );

  useEffect(() => {
    setCallForegroundServiceMode(
      needsForegroundService ? (mode === 'video' ? 'video' : 'audio') : null
    ).catch(() => undefined);
  }, [mode, needsForegroundService]);

  useEffect(() => {
    if (needsIncomingCallWindow) {
      callWindowManaged.current = true;
      setIncomingCallWindowActive(true).catch(() => undefined);
      return;
    }

    // No limpiar en el primer IDLE: el initial URL puede estar esperando socket/rehidratacion.
    // Una vez que JS administró la llamada entrante, cualquier salida de sus fases activas
    // restaura privacidad inmediatamente; MainActivity conserva un autocierre independiente.
    if (callWindowManaged.current) {
      callWindowManaged.current = false;
      setIncomingCallWindowActive(false).catch(() => undefined);
    }
  }, [needsIncomingCallWindow]);

  useEffect(
    () => () => {
      const store = useCallStore.getState();
      feedbackMode.current = 'none';
      feedbackCallId.current = null;
      setCallFeedbackMode('none').catch(() => undefined);
      store.unbindSocket();
      store.reset();
      setIncomingCallWindowActive(false).catch(() => undefined);
      resetCallForegroundService().catch(() => undefined);
    },
    []
  );

  return (
    <>
      <RadioLiveOverlay />
      <IncomingCallModal />
      <ActiveCallModal />
      <CallPermissionModal />
    </>
  );
}
