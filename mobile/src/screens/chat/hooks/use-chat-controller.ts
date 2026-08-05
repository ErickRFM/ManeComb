import { type Socket } from 'socket.io-client';
import { DesignSystem } from '@/constants/theme';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from '@/src/native/audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useShallow } from 'zustand/react/shallow';
import { getRtcIceConfigRequest } from '@/src/api/client';
import { getSharedRealtimeSocket } from '@/src/store/root-store';
import { canConversationStartCall } from '@/src/features/calls/call-selectors';
import { useCallStore } from '@/src/features/calls/call-store';
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionAsync } from '@/src/native/image-picker';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type {
  ConversationChannelMode,
  RtcIceConfig,
} from '@/src/types/app';
import { createStyles } from '../chat-screen.styles';
import type { CallMode, CallSession, DirectoryMode, LocalTextMessage, MobilePane, RecordingState, RtcParticipant } from '../types';
import { MAX_VOICE_NOTE_SECONDS } from '../types';
import { getPresenceStatus } from '@/src/utils/presence';
import { startCallForegroundService, stopCallForegroundService } from '@/src/native/call-service';
import { useChatDirectoryData } from './use-chat-directory-data';
import { useChatScroll } from './use-chat-scroll';
import {
  RTCPeerConnection as PlatformRTCPeerConnection,
  createRTCIceCandidate,
  createRTCSessionDescription,
  mediaDevices as platformMediaDevices,
  isWebRTCAvailable,
} from '@/src/native/webrtc';
type CloseActiveCallOptions = {
  reason?: string | null;
};

export function useChatController() {
  const route = useRoute();
  const handledRouteConversationRef = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const isCompact = width < DesignSystem.breakpoints.compact;
  const isPhone = width < DesignSystem.breakpoints.phone;
  const { theme } = useAppTheme();
  const {
    activeConversationId,
    chatContacts,
    conversations,
    isSubmitting,
    loadChatContacts,
    loadConversation,
    messagesByConversation,
    openDirectConversation,
    openGeneralConversation,
    presenceByUser,
    sendMessage,
    sendMediaMessage,
    sendVoiceMessage,
    setActiveConversationId,
    markAsRead,
    emitTyping,
    typingByConversation,
    token,
    user,
  } = useAppStore(
    useShallow((state) => ({
      activeConversationId: state.activeConversationId,
      chatContacts: state.chatContacts,
      conversations: state.conversations,
      isSubmitting: state.isSubmitting,
      loadChatContacts: state.loadChatContacts,
      loadConversation: state.loadConversation,
      messagesByConversation: state.messagesByConversation,
      openDirectConversation: state.openDirectConversation,
      openGeneralConversation: state.openGeneralConversation,
      presenceByUser: state.presenceByUser,
      sendMessage: state.sendMessage,
      sendVoiceMessage: state.sendVoiceMessage,
      sendMediaMessage: state.sendMediaMessage,
      setActiveConversationId: state.setActiveConversationId,
      markAsRead: state.markAsRead,
      emitTyping: state.emitTyping,
      typingByConversation: state.typingByConversation,
      token: state.token,
      user: state.user,
    }))
  );
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);
  const [directoryMode, setDirectoryMode] = useState<DirectoryMode>('all');
  const [mobilePane, setMobilePane] = useState<MobilePane>('directory');
  const [draft, setDraft] = useState('');
  const [attachmentMenuOpen, setAttachmentMenuVisible] = useState(false);
  const [attachmentMenuMode, setAttachmentMenuMode] = useState<'conversation' | 'directory'>('conversation');
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recorderMessage, setRecorderMessage] = useState<string | null>(null);
  const [failedVoiceNote, setFailedVoiceNote] = useState<{
    conversationId: string;
    formData: FormData;
  } | null>(null);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [callParticipants, setCallParticipants] = useState<RtcParticipant[]>([]);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [pendingTextMessages, setPendingTextMessages] = useState<LocalTextMessage[]>([]);
  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const joinedRtcRoomRef = useRef<string | null>(null);
  const currentCallModeRef = useRef<CallMode | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingIceCandidatesRef = useRef<
    Array<{ candidate: RTCIceCandidateInit; fromSocketId: string }>
  >([]);
  const isStartingCallRef = useRef(false);
  const callAttemptRef = useRef(0);
  // Se reporta usedRelay una sola vez por llamada; se reinicia al colgar.
  const relayStatsReportedRef = useRef(false);
  const rtcIceConfigRef = useRef<RtcIceConfig>({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    turnEnabled: false,
  });
  const closeActiveCallRef = useRef<(options?: CloseActiveCallOptions) => Promise<void>>(
    async () => undefined
  );
  const obtainLocalMediaRef = useRef<(mode: CallMode) => Promise<boolean>>(
    async () => false
  );

  useEffect(() => {
    if (!user || !isWebRTCAvailable()) return;

    // RC-MOBILE-CALLS-PRODUCTION-01 Bloque B: se elimina el segundo io(). Este controller consume
    // TEMPORALMENTE el socket compartido para el transporte de offer/answer/ICE (deuda de Bloque C,
    // que reescribira el pipeline y moveria el join). NO es dueno del lifecycle del socket (no lo
    // desconecta) y NO registra listeners globales de incoming-call (eso vive en features/calls).
    const socket = getSharedRealtimeSocket() as unknown as Socket | null;
    if (!socket) return;
    socketRef.current = socket;
    // Registro rastreado: en cleanup se quitan SOLO estos handlers (nunca removeAllListeners).
    const boundHandlers: Array<[string, (...args: any[]) => void]> = [];
    const on = (event: string, handler: (...args: any[]) => void) => {
      boundHandlers.push([event, handler]);
      socket.on(event, handler as any);
    };
    getRtcIceConfigRequest()
      .then((config) => {
        rtcIceConfigRef.current = config;
      })
      .catch(() => undefined);
    const resetPeerConnection = (clearPendingCandidates = true) => {
      if (clearPendingCandidates) pendingIceCandidatesRef.current = [];
      if (peerRef.current) {
        peerRef.current.onicecandidate = null;
        peerRef.current.ontrack = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.close();
        peerRef.current = null;
      }
    };

    // Determina si la llamada viajo por TURN (relay) o P2P directo, inspeccionando
    // el candidate pair activo. Se reporta una sola vez por sesion y de forma
    // defensiva: cualquier fallo simplemente no reporta y no rompe la llamada.
    const reportRelayUsage = async (
      peer: RTCPeerConnection,
      roomId: string,
      realtimeSocket: Socket
    ) => {
      if (relayStatsReportedRef.current) return;
      relayStatsReportedRef.current = true;

      try {
        const stats = await peer.getStats();
        const candidates = new Map<string, any>();
        let selectedPair: any = null;

        stats.forEach((report: any) => {
          if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
            candidates.set(report.id, report);
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (!selectedPair || report.nominated || report.selected) {
              selectedPair = report;
            }
          }
        });

        if (!selectedPair) return;

        const local = candidates.get(selectedPair.localCandidateId);
        const remote = candidates.get(selectedPair.remoteCandidateId);
        const usedRelay =
          local?.candidateType === 'relay' || remote?.candidateType === 'relay';

        realtimeSocket.emit('rtc:stats', { roomId, usedRelay });
      } catch {
        // getStats puede no estar disponible o fallar; se mantiene usedRelay=null.
      }
    };

    const buildPeerConnection = (
      roomId: string,
      targetSocketId: string,
      mode: CallMode
    ) => {
      resetPeerConnection(false);
      // Cada peer nuevo (quien llama o quien contesta) reporta usedRelay una vez.
      relayStatsReportedRef.current = false;

      const PC = PlatformRTCPeerConnection;
      if (!PC) return null;

      const peer = new PC({
        iceServers: rtcIceConfigRef.current.iceServers,
      });
      const localStream = localStreamRef.current;

      if (localStream) {
        localStream.getTracks().forEach((track) => {
          peer.addTrack(track, localStream);
        });
      }

      peer.onicecandidate = (event: any) => {
        if (!event.candidate) {
          return;
        }

        socket.emit('rtc:ice-candidate', {
          candidate: event.candidate.toJSON(),
          roomId,
          targetSocketId,
        });
      };

      peer.ontrack = (event: any) => {
        if (peerRef.current !== peer || joinedRtcRoomRef.current !== roomId) {
          return;
        }

        setCallSession((current) => {
          if (current?.roomId === roomId) {
            return {
              ...current,
              phase: 'connected',
              remoteStream: event.streams[0],
              remoteSocketId: targetSocketId,
            };
          }

          return current;
        });
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          setCallSession((current) =>
            current?.roomId === roomId
              ? {
                  ...current,
                  phase: 'connected',
                }
              : current
          );
          setCallNotice(mode === 'video' ? 'Videollamada activa.' : 'Llamada activa.');
          reportRelayUsage(peer, roomId, socket);
        }

        if (peer.connectionState === 'disconnected') {
          resetPeerConnection();
          setCallSession((current) =>
            current?.roomId === roomId
              ? { ...current, phase: 'reconnecting', remoteStream: null }
              : current
          );
          setCallNotice('Reconectando llamada...');
        }

        if (peer.connectionState === 'failed') {
          resetPeerConnection();
          setCallSession((current) =>
            current?.roomId === roomId
              ? { ...current, phase: 'failed', remoteStream: null, remoteSocketId: null }
              : current
          );
          setCallNotice('La llamada se perdio por fallo de conexion.');
        }
      };

      peerRef.current = peer;
      return peer;
    };

    obtainLocalMediaRef.current = async (mode: CallMode): Promise<boolean> => {
      if (localStreamRef.current) return true;

      try {
        const md = platformMediaDevices;
        if (!md) {
          setCallNotice('La cabina de llamadas no esta disponible.');
          return false;
        }

        const micPermission = await requestRecordingPermissionsAsync();
        if (!micPermission.granted) {
          setCallNotice('Se necesita permiso de microfono para llamar.');
          return false;
        }

        if (mode === 'video' && !(await requestCameraPermissionAsync())) {
          setCallNotice('Se necesita permiso de camara para videollamar.');
          return false;
        }

        const stream = await md.getUserMedia({
          audio: true,
          video: mode === 'video',
        });
        localStreamRef.current = stream as unknown as MediaStream;
        return true;
      } catch {
        setCallNotice('No se pudo acceder al microfono o camara.');
        return false;
      }
    };

    on(
      'rtc:participants',
      async (payload: { participants: RtcParticipant[]; roomId: string }) => {
        if (payload.roomId !== joinedRtcRoomRef.current) {
          return;
        }

        setCallParticipants(payload.participants);
        const others = payload.participants.filter(
          (participant) => participant.socketId !== socket.id
        );

        if (!others.length) {
          setCallSession((current) =>
            current?.roomId === payload.roomId
              ? {
                  ...current,
                  phase: 'ringing',
                  remoteStream: null,
                  remoteSocketId: null,
                }
              : current
          );
          return;
        }

        if (!localStreamRef.current || peerRef.current) {
          return;
        }

        const targetParticipant = others[0];

        const localSocketId = socket.id;

        if (!localSocketId || localSocketId.localeCompare(targetParticipant.socketId) > 0) {
          return;
        }

        const mode = currentCallModeRef.current || 'audio';
        const peer = buildPeerConnection(payload.roomId, targetParticipant.socketId, mode);
        if (!peer) return;
        const offer = await peer.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: mode === 'video',
        });
        await peer.setLocalDescription(offer);
        if (peerRef.current !== peer || joinedRtcRoomRef.current !== payload.roomId) {
          return;
        }
        socket.emit('rtc:offer', {
          offer,
          roomId: payload.roomId,
          targetSocketId: targetParticipant.socketId,
          mode,
          initiatedBy: user.id,
          userId: user.id,
        });
        setCallSession((current) =>
          current?.roomId === payload.roomId
            ? {
                ...current,
                phase: 'connecting',
                remoteSocketId: targetParticipant.socketId,
              }
            : current
        );
      }
    );

    on(
      'rtc:offer',
      async (payload: {
        fromSocketId: string;
        offer: RTCSessionDescriptionInit;
        roomId: string;
        mode?: CallMode;
      }) => {
        if (payload.roomId !== joinedRtcRoomRef.current) {
          return;
        }

        const mode = payload.mode || currentCallModeRef.current || 'audio';
        currentCallModeRef.current = mode;

        if (!localStreamRef.current) {
          const hasLocalMedia = await obtainLocalMediaRef.current(mode);
          if (!hasLocalMedia || !localStreamRef.current) {
            return;
          }
        }

        setCallSession((current) => current || {
          roomId: payload.roomId,
          mode,
          phase: 'connecting',
          joinedAt: Date.now(),
          remoteStream: null,
          remoteSocketId: payload.fromSocketId,
        });
        setCallNotice(mode === 'video' ? 'Conectando videollamada...' : 'Conectando llamada...');
        const peer = buildPeerConnection(payload.roomId, payload.fromSocketId, mode);
        if (!peer) return;
        await peer.setRemoteDescription(createRTCSessionDescription(payload.offer));
        if (peerRef.current !== peer || joinedRtcRoomRef.current !== payload.roomId) {
          return;
        }
        for (const queued of pendingIceCandidatesRef.current.splice(0)) {
          if (queued.fromSocketId === payload.fromSocketId) {
            await peer.addIceCandidate(createRTCIceCandidate(queued.candidate));
          }
        }
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (peerRef.current !== peer || joinedRtcRoomRef.current !== payload.roomId) {
          return;
        }
        socket.emit('rtc:answer', {
          answer,
          roomId: payload.roomId,
          targetSocketId: payload.fromSocketId,
          mode,
        });
        setCallSession((current) =>
          current?.roomId === payload.roomId
            ? {
                ...current,
                phase: 'connecting',
                remoteSocketId: payload.fromSocketId,
              }
            : current
        );
      }
    );

    on(
      'rtc:answer',
      async (payload: { answer: RTCSessionDescriptionInit; fromSocketId: string; roomId: string }) => {
        if (payload.roomId !== joinedRtcRoomRef.current || !peerRef.current) {
          return;
        }

        const peer = peerRef.current;
        await peer.setRemoteDescription(createRTCSessionDescription(payload.answer));
        if (peerRef.current !== peer || joinedRtcRoomRef.current !== payload.roomId) {
          return;
        }
        for (const queued of pendingIceCandidatesRef.current.splice(0)) {
          if (queued.fromSocketId === payload.fromSocketId) {
            await peer.addIceCandidate(createRTCIceCandidate(queued.candidate));
          }
        }
      }
    );

    on('rtc:ice-candidate', async (payload: { candidate: RTCIceCandidateInit; fromSocketId: string; roomId: string }) => {
      if (payload.roomId !== joinedRtcRoomRef.current) {
        return;
      }

      if (peerRef.current?.remoteDescription) {
        await peerRef.current.addIceCandidate(createRTCIceCandidate(payload.candidate));
      } else {
        if (pendingIceCandidatesRef.current.length >= 128) {
          pendingIceCandidatesRef.current.shift();
        }
        pendingIceCandidatesRef.current.push({
          candidate: payload.candidate,
          fromSocketId: payload.fromSocketId,
        });
      }
    });

    on('rtc:leave', (payload: { roomId: string; userId?: string }) => {
      if (payload.roomId !== joinedRtcRoomRef.current) {
        return;
      }

      resetPeerConnection();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      joinedRtcRoomRef.current = null;
      currentCallModeRef.current = null;
      setCallParticipants([]);
      setCallSession(null);
      setIsCallMuted(false);
      setIsCameraEnabled(true);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = null;
      setCallElapsedSeconds(0);
      setCallNotice('La otra persona abandono la cabina.');
    });

    on('rtc:hangup', (payload: { roomId: string }) => {
      if (payload.roomId !== joinedRtcRoomRef.current) {
        return;
      }

      resetPeerConnection();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      joinedRtcRoomRef.current = null;
      currentCallModeRef.current = null;
      setCallParticipants([]);
      setCallSession(null);
      setIsCallMuted(false);
      setIsCameraEnabled(true);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = null;
      setCallElapsedSeconds(0);
      setCallNotice('La otra persona finalizo la llamada.');
    });

    on('rtc:busy', (payload: { roomId: string }) => {
      if (payload.roomId !== joinedRtcRoomRef.current) return;
      resetPeerConnection();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      joinedRtcRoomRef.current = null;
      currentCallModeRef.current = null;
      setCallParticipants([]);
      setCallSession(null);
      setIsCallMuted(false);
      setIsCameraEnabled(true);
      stopCallTimer();
      setCallNotice('La persona esta en otra llamada.');
    });

    on('rtc:reject', (payload: { roomId: string }) => {
      if (payload.roomId !== joinedRtcRoomRef.current) return;
      resetPeerConnection();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      joinedRtcRoomRef.current = null;
      currentCallModeRef.current = null;
      setCallParticipants([]);
      setCallSession(null);
      setIsCallMuted(false);
      setIsCameraEnabled(true);
      stopCallTimer();
      setCallNotice('La llamada fue rechazada.');
    });

    on('rtc:timeout', (payload: { roomId: string }) => {
      if (payload.roomId !== joinedRtcRoomRef.current) return;
      resetPeerConnection();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      joinedRtcRoomRef.current = null;
      currentCallModeRef.current = null;
      setCallParticipants([]);
      setCallSession(null);
      setIsCallMuted(false);
      setIsCameraEnabled(true);
      stopCallTimer();
      setCallNotice('La llamada no fue respondida a tiempo.');
    });

    on('disconnect', () => {
      resetPeerConnection();
      setCallParticipants([]);
      setCallSession((current) =>
        current ? { ...current, phase: 'reconnecting', remoteStream: null, remoteSocketId: null } : current
      );
      setCallNotice('Reconectando senal de llamada...');
    });

    const onSocketReconnect = () => {
      const roomId = joinedRtcRoomRef.current;
      if (!roomId) {
        return;
      }

      socket.emit('rtc:join', {
        roomId,
        userId: user.id,
        name: user.name,
      });
      setCallNotice('Senal de llamada recuperada.');
    };
    socket.io.on('reconnect', onSocketReconnect);

    return () => {
      callAttemptRef.current += 1;
      isStartingCallRef.current = false;
      resetPeerConnection();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      joinedRtcRoomRef.current = null;
      currentCallModeRef.current = null;
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = null;
      setCallParticipants([]);
      setCallSession(null);
      setIsCallMuted(false);
      setIsCameraEnabled(true);
      setCallElapsedSeconds(0);
      // Socket COMPARTIDO: quitar SOLO los handlers de este controller; nunca desconectar ni
      // removeAllListeners (romperia el resto de la app).
      boundHandlers.forEach(([event, handler]) => socket.off(event, handler as any));
      socket.io.off('reconnect', onSocketReconnect);
    };
  }, [token, user]);

  const webRecorderRef = useRef<any>(null);
  const webStreamRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef<number | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bootstrappedRef = useRef(false);
  const nativeVoiceRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const chatConversations = useMemo(
    () => conversations.filter((conversation) => conversation.channelMode === 'chat'),
    [conversations]
  );

  useEffect(() => {
    loadChatContacts();
  }, [loadChatContacts]);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }

    if (chatConversations.length) {
      bootstrappedRef.current = true;
      const preferredConversation =
        chatConversations.find(
          (conversation) => conversation.kind === 'group' && conversation.channelMode === 'chat'
        ) || chatConversations[0];

      if (preferredConversation?.id) {
        setActiveConversationId(preferredConversation.id);
        if (messagesByConversation[preferredConversation.id] === undefined) {
          loadConversation(preferredConversation.id).catch(() => undefined);
        }
      }

      return;
    }

    bootstrappedRef.current = true;
    openGeneralConversation('chat').then((conversation) => {
      if (conversation?.id && isCompact) {
        setMobilePane('conversation');
      }
    });
  }, [
    chatConversations,
    isCompact,
    loadConversation,
    openGeneralConversation,
    messagesByConversation,
    setActiveConversationId,
  ]);

  useEffect(() => {
    if (!chatConversations.length) {
      return;
    }

    const isCurrentConversationAvailable = chatConversations.some(
      (conversation) => conversation.id === activeConversationId
    );

    if (isCurrentConversationAvailable) {
      return;
    }

    const fallbackConversation =
      chatConversations.find((conversation) => conversation.kind === 'group') ||
      chatConversations[0];

    setActiveConversationId(fallbackConversation.id);
    if (messagesByConversation[fallbackConversation.id] === undefined) {
      loadConversation(fallbackConversation.id).catch(() => undefined);
    }
  }, [activeConversationId, chatConversations, loadConversation, messagesByConversation, setActiveConversationId]);

  useEffect(() => {
    if (!isCompact) {
      setMobilePane('conversation');
    }
  }, [isCompact]);

  useEffect(() => {
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      nativeVoiceRecorder.stop().catch(() => undefined);
      webRecorderRef.current?.stop?.();
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
    };
  }, [nativeVoiceRecorder]);

  const {
    activeContact,
    activeConversation,
    activeConversationKey,
    activeMessageItems,
    activeMessages,
    conversationFilterCounts,
    directoryHelperText,
    directoryItems,
  } = useChatDirectoryData({
    activeConversationId,
    chatConversations,
    directoryMode,
    messagesByConversation,
    pendingTextMessages,
    userId: user?.id,
  });

  useEffect(() => {
    if (!activeConversationKey || !user?.id || (isCompact && mobilePane !== 'conversation')) {
      return;
    }

    const latestIncomingMessage = [...activeMessages]
      .reverse()
      .find((message) => message.senderId !== user.id);

    if (latestIncomingMessage) {
      markAsRead(activeConversationKey, latestIncomingMessage.id);
    }
  }, [activeConversationKey, activeMessages, isCompact, markAsRead, mobilePane, user?.id]);

  // RC-MOBILE-CALLS-PRODUCTION-01 Bloque C: abrir una conversacion YA NO ejecuta rtc:join.
  // El join a la sala rtc:call:{callId} lo hace el runtime global SOLO tras aceptar una llamada.

  // C: startCall delega al store global (features/calls). El controller ya NO crea peer/estado
  // local ni hace rtc:join; el pipeline (media/ICE/peer/negociacion) vive en el runtime global.
  const startCall = useCallback(
    async (mode: CallMode) => {
      if (!activeConversation) {
        setCallNotice('Selecciona una conversacion directa para llamar.');
        return;
      }
      if (!canConversationStartCall(activeConversation)) {
        setCallNotice('Las llamadas grupales se realizan en Radio.');
        return;
      }
      const result = await useCallStore.getState().startCall({
        conversationId: activeConversation.id,
        mode,
      });
      if (!result.ok) {
        const notice =
          result.code === 'busy'
            ? 'La unidad esta ocupada en otra llamada.'
            : result.code === 'direct_call_required'
              ? 'Solo se puede llamar en conversaciones directas.'
              : 'No fue posible iniciar la llamada.';
        setCallNotice(notice);
      }
    },
    [activeConversation, setCallNotice]
  );

  const composerPlaceholder = 'Escribe un mensaje...';
  const supportsMicrophoneCapture =
    Platform.OS !== 'web' ||
    (typeof globalThis !== 'undefined' &&
      Boolean((globalThis as any).navigator?.mediaDevices?.getUserMedia) &&
      typeof (globalThis as any).MediaRecorder !== 'undefined');
  const canSendText =
    Boolean(activeConversation && draft.trim()) && recordingState === 'idle' && !isSubmitting;
  const canRecord = recordingState !== 'uploading' && supportsMicrophoneCapture;
  // Un unico punto de control para el foreground service: toda via que abra o
  // cierre la llamada (colgar, rechazo, timeout, cambio de chat, desmontaje)
  // pasa por callSession, asi que el servicio no puede quedar huerfano.
  const isCallActive = Boolean(callSession);
  const isVideoCall = callSession?.mode === 'video';

  useEffect(() => {
    if (!isCallActive) return;

    startCallForegroundService(isVideoCall);

    return () => {
      stopCallForegroundService();
    };
  }, [isCallActive, isVideoCall]);

  const activeCallSession =
    activeConversation && callSession?.roomId === activeConversation.id ? callSession : null;
  const callStatusLabel = activeCallSession
    ? activeCallSession.phase === 'connected'
      ? 'En llamada'
      : activeCallSession.phase === 'connecting'
        ? 'Conectando'
        : activeCallSession.phase === 'reconnecting'
          ? 'Reconectando'
        : 'Esperando'
    : 'Listo';
  const callTone: 'positive' | 'warning' | 'neutral' =
    activeCallSession?.phase === 'connected'
      ? 'positive'
      : activeCallSession?.phase === 'connecting' || activeCallSession?.phase === 'reconnecting'
        ? 'warning'
        : 'neutral';
  const sortedOperationalContacts = useMemo(
    () =>
      (chatContacts || []).slice().sort((left, right) => {
        const rank = (userId: string) => {
          const presence = getPresenceStatus(presenceByUser, userId);
          return presence === 'online' ? 0 : presence === 'offline' ? 2 : 1;
        };
        const statusDiff = rank(left.id) - rank(right.id);

        if (statusDiff) {
          return statusDiff;
        }

        return left.name.localeCompare(right.name);
      }),
    [chatContacts, presenceByUser]
  );
  const setAttachmentMenuOpen = useCallback((open: boolean) => {
    if (open) {
      setAttachmentMenuMode('conversation');
    }
    setAttachmentMenuVisible(open);
  }, []);
  const openDirectoryMenu = useCallback(() => {
    setAttachmentMenuMode('directory');
    setAttachmentMenuVisible(true);
  }, []);
  const {
    handleMessagesContentSizeChange,
    handleMessagesLayout,
    handleMessagesScroll,
    isNearMessagesBottomRef,
    messagesListRef,
    scrollMessagesToEnd,
    shouldScrollAfterSendRef,
  } = useChatScroll({ activeConversationKey, activeMessageItems });

  const startRecordingTicker = () => {
    recordStartedAtRef.current = Date.now();
    setRecordingSeconds(0);

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
    }

    recordTimerRef.current = setInterval(() => {
      if (!recordStartedAtRef.current) {
        return;
      }

      const elapsedSeconds = Math.max(
        1,
        Math.round((Date.now() - recordStartedAtRef.current) / 1000)
      );

      setRecordingSeconds(elapsedSeconds);

      if (elapsedSeconds >= MAX_VOICE_NOTE_SECONDS) {
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }

        setRecorderMessage(`Limite de ${MAX_VOICE_NOTE_SECONDS}s alcanzado. Enviando audio...`);
        (Platform.OS === 'web' ? stopWebRecording() : stopNativeRecording());
      }
    }, 400);
  };

  const stopRecordingTicker = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    recordStartedAtRef.current = null;
    setRecordingSeconds(0);
  };

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    if (isCompact) {
      setMobilePane('conversation');
    }
    if (messagesByConversation[conversationId] === undefined) {
      loadConversation(conversationId).catch(() => undefined);
    }
  };

  // Deep link desde la notificacion nativa: manecomb://chat?conversationId=...
  const routeConversationId = String(
    (route.params as { conversationId?: string } | undefined)?.conversationId || ''
  ).trim();

  useEffect(() => {
    if (!routeConversationId || handledRouteConversationRef.current === routeConversationId) {
      return;
    }

    handledRouteConversationRef.current = routeConversationId;
    handleSelectConversation(routeConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeConversationId]);

  const handleOpenGeneral = async (channelMode: ConversationChannelMode) => {
    const conversation = await openGeneralConversation(channelMode);

    if (conversation?.id && isCompact) {
      setMobilePane('conversation');
    }
  };

  const handleOpenDirect = async (
    contactId: string,
    channelMode: ConversationChannelMode = 'chat'
  ) => {
    const conversation = await openDirectConversation(contactId, channelMode);

    if (conversation?.id && isCompact) {
      setMobilePane('conversation');
    }
  };

  const handleSendText = async () => {
    if (!activeConversation || !draft.trim()) {
      return;
    }

    const text = draft.trim();
    const localId = `local-${activeConversation.id}-${Date.now()}`;
    const localMessage: LocalTextMessage = {
      id: localId,
      conversationId: activeConversation.id,
      senderId: user?.id || 'local-user',
      sender: user || null,
      kind: 'text',
      text,
      createdAt: new Date().toISOString(),
      localStatus: 'sending',
      retryText: text,
    };

    shouldScrollAfterSendRef.current = true;
    setPendingTextMessages((current) => [...current, localMessage]);

    try {
      const result = await sendMessage(activeConversation.id, text);

      if (!result || result.ok) {
        setDraft('');
        setPendingTextMessages((current) => current.filter((message) => message.id !== localId));
        return;
      }
    } catch {
      // Fallo de red — el draft se conserva, el mensaje se marca como fallido
    }

    setPendingTextMessages((current) =>
      current.map((message) =>
        message.id === localId
          ? { ...message, localStatus: 'failed' }
          : message
      )
    );
  };

  const handleRetryTextMessage = async (message: LocalTextMessage) => {
    if (!message.conversationId || message.localStatus !== 'failed') {
      return;
    }

    shouldScrollAfterSendRef.current = true;
    setPendingTextMessages((current) =>
      current.map((entry) =>
        entry.id === message.id
          ? {
              ...entry,
              localStatus: 'sending',
              createdAt: new Date().toISOString(),
            }
          : entry
      )
    );

    const result = await sendMessage(message.conversationId, message.retryText);

    if (!result || result.ok) {
      setPendingTextMessages((current) => current.filter((entry) => entry.id !== message.id));
      return;
    }

    setPendingTextMessages((current) =>
      current.map((entry) =>
        entry.id === message.id
          ? {
              ...entry,
              localStatus: 'failed',
            }
          : entry
      )
    );
  };

  const syncCallTimer = (joinedAt: number) => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }

    const updateTimer = () => {
      setCallElapsedSeconds(Math.max(0, Math.round((Date.now() - joinedAt) / 1000)));
    };

    updateTimer();
    callTimerRef.current = setInterval(updateTimer, 1000);
  };

  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    setCallElapsedSeconds(0);
  };

  const stopLocalCallTracks = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  };

  const closeActiveCall = async (
    options: CloseActiveCallOptions = {}
  ) => {
    callAttemptRef.current += 1;
    isStartingCallRef.current = false;
    const { reason = null } = options;
    const roomId = joinedRtcRoomRef.current;

    if (roomId && socketRef.current) {
      socketRef.current.emit('rtc:hangup', { roomId });
      socketRef.current.emit('rtc:leave', { roomId });
    }

    peerRef.current?.close();
    peerRef.current = null;
    stopLocalCallTracks();
    joinedRtcRoomRef.current = null;
    currentCallModeRef.current = null;
    setCallParticipants([]);
    setCallSession(null);
    setIsCallMuted(false);
    setIsCameraEnabled(true);
    stopCallTimer();

    if (reason) {
      setCallNotice(reason);
    }
  };

  closeActiveCallRef.current = closeActiveCall;

  const toggleCallMute = () => {
    const nextMuted = !isCallMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsCallMuted(nextMuted);
  };

  const toggleCamera = () => {
    const videoTracks = localStreamRef.current?.getVideoTracks() || [];

    if (!videoTracks.length) {
      return;
    }

    const nextCameraEnabled = !isCameraEnabled;
    videoTracks.forEach((track) => {
      track.enabled = nextCameraEnabled;
    });
    setIsCameraEnabled(nextCameraEnabled);
  };

  // Single delivery point for voice notes. The store never throws on a failed
  // upload — it reports `{ ok: false }` — so the result MUST be inspected here.
  // Announcing success without reading it is what made a failed send look sent.
  const deliverVoiceNote = async (conversationId: string, formData: FormData) => {
    const result = await sendVoiceMessage(conversationId, formData);

    if (!result.ok) {
      setFailedVoiceNote({ conversationId, formData });
      setRecorderMessage(result.message || 'No fue posible enviar la nota de voz.');
      setRecordingState('idle');
      return false;
    }

    setFailedVoiceNote(null);
    setDraft('');
    // A queued-for-sync result is `ok` but is NOT delivered yet, so it must not
    // claim to be sent.
    setRecorderMessage(result.message || 'Nota de voz enviada.');
    setRecordingState('idle');
    return true;
  };

  const retryVoiceNote = async () => {
    if (!failedVoiceNote) {
      return;
    }

    setRecordingState('uploading');
    setRecorderMessage('Reintentando envio de la nota de voz...');
    await deliverVoiceNote(failedVoiceNote.conversationId, failedVoiceNote.formData);
  };

  const buildNativeVoiceFormData = async (uri: string, durationSeconds: number) => {
    const formData = new FormData();
    formData.append('durationSeconds', String(durationSeconds));
    formData.append('caption', draft.trim());
    formData.append('file', {
      uri,
      name: `voice-note-${Date.now()}.m4a`,
      type: 'audio/mp4',
    } as any);
    return formData;
  };

  const startNativeRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();

    if (!permission.granted) {
      setRecorderMessage('La app necesita permiso de microfono para grabar notas de voz.');
      return;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });

    await nativeVoiceRecorder.prepareToRecordAsync();
    nativeVoiceRecorder.record();
    startRecordingTicker();
    setRecorderMessage('Grabando nota de voz...');
    setRecordingState('recording');
  };

  const stopNativeRecording = async () => {
    if (!activeConversation) {
      return;
    }

    setRecordingState('uploading');
    await nativeVoiceRecorder.stop();
    const status = nativeVoiceRecorder.getStatus();
    const uri = status.url || nativeVoiceRecorder.uri;
    stopRecordingTicker();
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });

    if (!uri) {
      setRecorderMessage('No se pudo recuperar el audio grabado.');
      setRecordingState('idle');
      return;
    }

    const formData = await buildNativeVoiceFormData(
      uri,
      Math.max(1, Math.round(Number(status.durationMillis || 0) / 1000))
    );

    await deliverVoiceNote(activeConversation.id, formData);
  };

  const startWebRecording = async () => {
    const runtime = globalThis as any;
    const mediaDevices = runtime.navigator?.mediaDevices;
    const MediaRecorderCtor = runtime.MediaRecorder;

    if (!mediaDevices?.getUserMedia || !MediaRecorderCtor) {
      setRecorderMessage('Este navegador no soporta grabacion de audio para notas de voz.');
      return;
    }

    const stream = await mediaDevices.getUserMedia({
      audio: true,
    });
    const preferredMimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ].find((mimeType) =>
      typeof MediaRecorderCtor.isTypeSupported === 'function'
        ? MediaRecorderCtor.isTypeSupported(mimeType)
        : mimeType === 'audio/webm'
    );
    const recorder = preferredMimeType
      ? new MediaRecorderCtor(stream, {
          mimeType: preferredMimeType,
        })
      : new MediaRecorderCtor(stream);
    webStreamRef.current = stream;
    webRecorderRef.current = recorder;
    webChunksRef.current = [];
    recorder.ondataavailable = (event: any) => {
      if (event.data?.size) {
        webChunksRef.current.push(event.data);
      }
    };

    recorder.start();
    startRecordingTicker();
    setRecorderMessage('Grabando nota de voz...');
    setRecordingState('recording');
  };

  const stopWebRecording = async () => {
    if (!activeConversation || !webRecorderRef.current) {
      return;
    }

    setRecordingState('uploading');
    const recorder = webRecorderRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';
    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - Number(recordStartedAtRef.current || Date.now())) / 1000)
    );

    await new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(webChunksRef.current, {
          type: mimeType,
        });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, {
          type: mimeType,
        });
        const formData = new FormData();
        formData.append('durationSeconds', String(durationSeconds));
        formData.append('caption', draft.trim());
        formData.append('file', file);
        await deliverVoiceNote(activeConversation.id, formData);
        resolve();
      };
      recorder.stop();
    });

    webRecorderRef.current = null;
    webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
    webStreamRef.current = null;
    webChunksRef.current = [];
    stopRecordingTicker();
  };

  const handleVoiceAction = async () => {
    if (!activeConversation || !canRecord) {
      return;
    }

    try {
      if (recordingState === 'recording') {
        if (Platform.OS === 'web') {
          await stopWebRecording();
          return;
        }

        await stopNativeRecording();
        return;
      }

      if (Platform.OS === 'web') {
        await startWebRecording();
        return;
      }

      await startNativeRecording();
    } catch (error) {
      stopRecordingTicker();
      setRecordingState('idle');
      setRecorderMessage(
        error instanceof Error ? error.message : 'No fue posible usar el microfono.'
      );
    }
  };

  const activeCallJoinedAt = callSession?.joinedAt ?? null;
  const activeCallPhase = callSession?.phase ?? null;

  useEffect(() => {
    if (!activeCallJoinedAt) {
      stopCallTimer();
      return;
    }

    syncCallTimer(activeCallJoinedAt);
    return () => {
      stopCallTimer();
    };
  }, [activeCallJoinedAt]);

  useEffect(() => {
    if (activeCallPhase !== 'ringing' && activeCallPhase !== 'reconnecting') {
      return;
    }

    const timeoutId = setTimeout(() => {
      closeActiveCallRef.current({
        reason:
          activeCallPhase === 'reconnecting'
            ? 'La llamada termino porque no fue posible recuperar la conexion.'
            : 'La llamada termino porque no hubo respuesta.',
      }).catch(() => undefined);
    }, activeCallPhase === 'reconnecting' ? 15000 : 30000);

    return () => clearTimeout(timeoutId);
  }, [activeCallPhase]);

  useEffect(() => {
    if (!callSession || !activeConversation) {
      return;
    }

    if (callSession.roomId !== activeConversation.id) {
      const roomId = joinedRtcRoomRef.current;

      if (roomId && socketRef.current) {
        socketRef.current.emit('rtc:leave', { roomId });
      }

      peerRef.current?.close();
      peerRef.current = null;
      stopLocalCallTracks();
      joinedRtcRoomRef.current = null;
      currentCallModeRef.current = null;
      setCallParticipants([]);
      setCallSession(null);
      setIsCallMuted(false);
      setIsCameraEnabled(true);
      stopCallTimer();
      setCallNotice('La llamada se cerro al cambiar de chat.');
    }
  }, [activeConversation, callSession]);

  const handleMediaPicked = useCallback(async (source: 'camera' | 'gallery') => {
    if (!activeConversation) return;
    try {
      const pickerResult = source === 'camera'
        ? await launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
      if (pickerResult.canceled || !pickerResult.assets.length) return;
      const asset = pickerResult.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || (source === 'camera' ? 'photo.jpg' : 'video.mp4'),
        type: asset.mimeType || (source === 'camera' ? 'image/jpeg' : 'video/mp4'),
      } as any);
      if (asset.mimeType?.startsWith('image/')) {
        formData.append('caption', draft || '');
      }
      const sendResult = await sendMediaMessage(activeConversation.id, formData);
      if (!sendResult.ok) {
        throw new Error(sendResult.message || 'No fue posible subir el archivo.');
      }
      setDraft('');
    } catch (error) {
      setAttachmentNotice(
        error instanceof Error
          ? error.message
          : 'No fue posible subir el archivo. Verifica tu conexion.'
      );
    }
  }, [activeConversation, draft, sendMediaMessage, setDraft, setAttachmentNotice]);

  const showDirectoryPanel = !isCompact || mobilePane === 'directory';
  const showConversationPanel = !isCompact || mobilePane === 'conversation';
  const isMobileConversation = isCompact && mobilePane === 'conversation';

  return {
    activeAudioMessageId,
    activeCallSession,
    activeContact,
    activeConversation,
    activeMessageItems,
    attachmentMenuOpen,
    attachmentMenuMode,
    attachmentNotice,
    callElapsedSeconds,
    callNotice,
    callParticipants,
    callStatusLabel,
    callTone,
    canRecord,
    canSendText,
    // RC-MOBILE-CALLS-PRODUCTION-01 Bloque B: solo conversaciones DIRECTAS pueden llamar por RTC.
    // La comunicacion grupal (General Operativo) pertenece a Radio; el backend tambien lo rechaza.
    canStartCall: canConversationStartCall(activeConversation),
    closeActiveCall,
    startCall,
    composerPlaceholder,
    conversationFilterCounts,
    directoryHelperText,
    directoryItems,
    directoryMode,
    draft,
    handleMediaPicked,
    handleMessagesContentSizeChange,
    handleMessagesLayout,
    handleMessagesScroll,
    handleOpenDirect,
    handleOpenGeneral,
    openDirectoryMenu,
    handleSelectConversation,
    handleRetryTextMessage,
    handleSendText,
    handleVoiceAction,
    isCallMuted,
    isCameraEnabled,
    isCompact,
    isMobileConversation,
    isNearMessagesBottomRef,
    isPhone,
    isSubmitting,
    localStreamRef,
    markAsRead,
    emitTyping,
    typingByConversation,
    messagesListRef,
    mobilePane,
    recordingSeconds,
    presenceByUser,
    recordingState,
    recorderMessage,
    canRetryVoiceNote: Boolean(failedVoiceNote),
    retryVoiceNote,
    scrollMessagesToEnd,
    setActiveAudioMessageId,
    setAttachmentMenuOpen,
    setCallNotice,
    setDirectoryMode,
    setDraft,
    setMobilePane,
    showConversationPanel,
    showDirectoryPanel,
    sortedOperationalContacts,
    styles,
    theme,
    toggleCallMute,
    toggleCamera,
    token,
    user,
  };
}
