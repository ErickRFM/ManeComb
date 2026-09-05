import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SOCKET_URL } from '@/src/api/client';
import { useCallStore } from '@/src/features/calls/call-store';
import { useAppStore } from '@/src/store/use-app-store';
import { logRealtimeDiag } from '@/src/store/realtime-diagnostics-log';
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
  const { activate, reset, setCallActive, setSessionAuthState, phase, lastErrorCode, nativeConnected, authRevision } = useRadioLiveStore(
    useShallow((state) => ({
      activate: state.activate,
      reset: state.reset,
      setCallActive: state.setCallActive,
      setSessionAuthState: state.setSessionAuthState,
      phase: state.phase,
      lastErrorCode: state.lastErrorCode,
      nativeConnected: state.connected,
      authRevision: state.authRevision,
    }))
  );
  const {
    activeConversationId,
    authContext,
    conversations,
    openGeneralConversation,
    realtimeAuthState,
    recoverRealtimeAuth,
    confirmRealtimeAuth,
    socketStatus,
    token,
    user,
  } = useAppStore(
    useShallow((state) => ({
      activeConversationId: state.activeConversationId,
      authContext: state.authContext,
      conversations: state.conversations,
      openGeneralConversation: state.openGeneralConversation,
      realtimeAuthState: state.realtimeAuthState,
      recoverRealtimeAuth: state.recoverRealtimeAuth,
      confirmRealtimeAuth: state.confirmRealtimeAuth,
      socketStatus: state.socketStatus,
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
    if (realtimeAuthState !== 'ready') return undefined;

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
  }, [conversations, eligible, ensureAttempt, openGeneralConversation, realtimeAuthState, reset, user]);

  useEffect(() => {
    if (!RADIO_LIVE_SUPPORTED || !eligible || !user || !token || !channelId || realtimeAuthState !== 'ready') return;
    if (useAppStore.getState().token !== token || useAppStore.getState().realtimeAuthState !== 'ready') return;
    logRealtimeDiag('radio:activate', { reason: 'session_credentials_applied' });
    activate({
      channelId,
      token,
      userId: user.id,
      userName: user.name || 'Operador',
      socketUrl: SOCKET_URL,
    });
  }, [activate, channelId, eligible, realtimeAuthState, token, user]);

  // Native Radio reports handshake rejection, never refreshes credentials itself.
  // The global authority parks BOTH transports while the shared HTTP single-flight runs.
  useEffect(() => {
    if (!token) return;
    const currentAuth = useAppStore.getState();
    if (currentAuth.token !== token || currentAuth.realtimeAuthState !== realtimeAuthState) return;
    if (!RADIO_LIVE_SUPPORTED || !eligible || !channelId) {
      // An inactive/unsupported Radio is not an authentication voter. The
      // existing shared socket remains authoritative for its own recovery.
      if (realtimeAuthState === 'ready' && socketStatus === 'connected') confirmRealtimeAuth(token);
      return;
    }
    const nativeState = useRadioLiveStore.getState();
    if (realtimeAuthState !== 'ready') {
      setSessionAuthState(realtimeAuthState);
    } else if (nativeState.authRevision !== nativeState._activationRevision || nativeState.authRevision !== authRevision) {
      return; // Waiting for the native acknowledgement of the new credentials.
    } else if (nativeState.lastErrorCode === 'radio_auth_refresh_required') {
      logRealtimeDiag('radio:auth_recovery_requested', { phase: nativeState.phase });
      void recoverRealtimeAuth(token);
    } else if (nativeConnected && nativeState.connected && socketStatus === 'connected' &&
      (['LISTENING', 'RECEIVING', 'TRANSMITTING', 'REQUESTING', 'CHANNEL_BUSY'].includes(nativeState.phase) ||
        (callOwnsAudio && nativeState.phase === 'PAUSED_BY_CALL') ||
        (nativeState.phase === 'ERROR' && nativeState.lastErrorCode === 'forbidden'))) {
      // Namespace connect is not a channel ACK. Resetting during JOINING would
      // allow an unauthorized join to start another refresh cycle forever.
      // A call-owned pause intentionally skips join; a channel permission
      // denial is not failed authentication. Neither may poison later expiry.
      confirmRealtimeAuth(token);
    }
  }, [authRevision, callOwnsAudio, channelId, confirmRealtimeAuth, eligible, lastErrorCode, nativeConnected, phase, realtimeAuthState, recoverRealtimeAuth, setSessionAuthState, socketStatus, token]);

  // Llamadas y Radio no pueden poseer el microfono a la vez: la llamada gana.
  useEffect(() => {
    if (!RADIO_LIVE_SUPPORTED) return;
    setCallActive(callOwnsAudio);
  }, [callOwnsAudio, setCallActive]);

  return null;
}
