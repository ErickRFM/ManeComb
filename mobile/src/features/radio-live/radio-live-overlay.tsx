import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SOCKET_URL } from '@/src/api/client';
import { useCallStore } from '@/src/features/calls/call-store';
import { useAppStore } from '@/src/store/use-app-store';
import { RADIO_LIVE_SUPPORTED } from './radio-live-runtime';
import { useRadioLiveStore } from './radio-live-store';

/**
 * Ancla de la sesion de Radio. No renderiza UI y ya no usa el socket compartido
 * de JavaScript: su unico trabajo es decirle al servicio nativo quien es el
 * operador, que canal quiere y cuando una llamada toma el audio.
 *
 * Que este componente se re-renderice o se desmonte no afecta a la sesion: el
 * canal vive en el servicio.
 */
export function RadioLiveOverlay(): React.ReactElement | null {
  const callPhase = useCallStore((state) => state.phase);
  const { activate, reset, setCallActive } = useRadioLiveStore(
    useShallow((state) => ({
      activate: state.activate,
      reset: state.reset,
      setCallActive: state.setCallActive,
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
  const sessionOwnerRef = useRef<string | null>(null);

  const eligible = Boolean(user && token && authContext?.canAccessMobile === true);
  const callOwnsAudio = ['CONNECTING', 'CONNECTED', 'RECONNECTING', 'ENDING'].includes(callPhase);

  // Un unico productor del canal activo: la seleccion operativa del store. Si el
  // operador no esta sobre un canal de radio, se escucha el canal general.
  const selectedRadioChannelId =
    conversations.find(
      (conversation) =>
        conversation.channelMode === 'radio' && conversation.id === activeConversationId
    )?.id || null;
  const channelId = selectedRadioChannelId || generalChannelId;

  // Cambiar de cuenta debe destruir la sesion nativa antes de abrir otra.
  useEffect(() => {
    const nextOwner = user?.id || null;
    if (sessionOwnerRef.current === nextOwner) return;
    sessionOwnerRef.current = nextOwner;
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
    if (!RADIO_LIVE_SUPPORTED || !eligible || !user || !token || !channelId) return;
    activate({
      channelId,
      token,
      userId: user.id,
      userName: user.name || 'Operador',
      socketUrl: SOCKET_URL,
    });
  }, [activate, channelId, eligible, token, user]);

  // Llamadas y Radio no pueden poseer el microfono a la vez: la llamada gana.
  useEffect(() => {
    if (!RADIO_LIVE_SUPPORTED) return;
    setCallActive(callOwnsAudio);
  }, [callOwnsAudio, setCallActive]);

  return null;
}
