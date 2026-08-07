import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useCallStore } from '@/src/features/calls/call-store';
import { useAppStore, useSharedRealtimeSocket } from '@/src/store/use-app-store';
import { createNativeRadioLiveRuntime } from './radio-live-runtime';
import {
  setRadioLiveRuntimeFactory,
  useRadioLiveStore,
} from './radio-live-store';

setRadioLiveRuntimeFactory(createNativeRadioLiveRuntime);

// El PTT en vivo depende de la captura/reproduccion PCM nativa. Web usa notas de
// voz (MediaRecorder + subida) y no debe levantar este runtime.
const SUPPORTS_LIVE_RADIO = Platform.OS !== 'web';

/**
 * Ancla del runtime unico de Radio. No renderiza UI: solo reconcilia sesion,
 * canal y preempcion por llamada contra `useRadioLiveStore`. La pantalla /radio
 * es un consumidor mas y nunca detiene este runtime.
 */
export function RadioLiveOverlay(): React.ReactElement | null {
  const socket = useSharedRealtimeSocket();
  const callPhase = useCallStore((state) => state.phase);
  const { activate, pause, reset } = useRadioLiveStore(
    useShallow((state) => ({
      activate: state.activate,
      pause: state.pause,
      reset: state.reset,
    }))
  );
  const {
    activeConversationId,
    authContext,
    conversations,
    openGeneralConversation,
    token,
    user,
  } = useAppStore(
    useShallow((state) => ({
      activeConversationId: state.activeConversationId,
      authContext: state.authContext,
      conversations: state.conversations,
      openGeneralConversation: state.openGeneralConversation,
      token: state.token,
      user: state.user,
    }))
  );
  const [generalChannelId, setGeneralChannelId] = useState<string | null>(null);
  const [ensureAttempt, setEnsureAttempt] = useState(0);
  const channelOwnerRef = useRef<string | null>(null);

  const eligible = Boolean(user && token && authContext?.canAccessMobile === true);
  const callOwnsAudio = ['CONNECTING', 'CONNECTED', 'RECONNECTING', 'ENDING'].includes(callPhase);

  // Un unico productor del canal activo: la seleccion operativa del store. Si el
  // usuario no esta sobre un canal de radio, se escucha el canal general.
  const selectedRadioChannelId =
    conversations.find(
      (conversation) =>
        conversation.channelMode === 'radio' && conversation.id === activeConversationId
    )?.id || null;
  const channelId = selectedRadioChannelId || generalChannelId;

  useEffect(() => {
    const nextOwner = user?.id || null;
    if (channelOwnerRef.current === nextOwner) return;
    channelOwnerRef.current = nextOwner;
    setGeneralChannelId(null);
    setEnsureAttempt(0);
    reset();
  }, [reset, user?.id]);

  useEffect(() => {
    if (!eligible || !user) {
      setGeneralChannelId(null);
      reset();
      return undefined;
    }

    const existingGeneral = conversations.find(
      (conversation) =>
        conversation.channelMode === 'radio' && conversation.kind === 'group'
    );

    if (existingGeneral?.id) {
      setGeneralChannelId(existingGeneral.id);
      return undefined;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    openGeneralConversation('radio', { setActive: false })
      .then((conversation) => {
        if (!cancelled && conversation?.id) {
          setGeneralChannelId(conversation.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          retryTimer = setTimeout(() => setEnsureAttempt((value) => value + 1), 10000);
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [conversations, eligible, ensureAttempt, openGeneralConversation, reset, user]);

  useEffect(() => {
    if (!SUPPORTS_LIVE_RADIO || !eligible || !user || !channelId || !socket) return;

    // Llamadas y Radio no pueden poseer el microfono a la vez: la llamada gana y
    // Radio queda en PAUSED_BY_CALL hasta que el runtime se reactive.
    if (callOwnsAudio) {
      pause('call');
      return;
    }

    activate({ channelId, socket, userId: user.id, userName: user.name });
  }, [activate, callOwnsAudio, channelId, eligible, pause, socket, user]);

  useEffect(() => () => reset(), [reset]);

  return null;
}
