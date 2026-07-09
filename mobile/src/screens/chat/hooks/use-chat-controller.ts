import { io, type Socket } from 'socket.io-client';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from '@/src/native/audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { transcribeVoiceSearchRequest, SOCKET_URL } from '@/src/api/client';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type {
  ConversationChannelMode,
} from '@/src/types/app';
import { createStyles } from '../chat-screen.styles';
import type { CallMode, CallSession, DirectoryMode, LocalTextMessage, MobilePane, OperationalActionCategory, RecordingState, RtcParticipant, VoiceSearchState } from '../types';
import { MAX_VOICE_NOTE_SECONDS, MAX_VOICE_SEARCH_SECONDS } from '../types';
import { getConversationPresenceLabel, getOperationalStatusRank, getOperationalStatusTone } from '../utils/conversation';
import { sendPickedChatMedia } from '../services/chat-attachment-service';
import { useChatDirectoryData } from './use-chat-directory-data';
import { useChatScroll } from './use-chat-scroll';

export function useChatController() {
  const { width } = useWindowDimensions();
  const isCompact = width < 1080;
  const isPhone = width < 720;
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
    sendMessage,
    sendVoiceMessage,
    setActiveConversationId,
    sendMediaMessage,
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
      sendMessage: state.sendMessage,
      sendVoiceMessage: state.sendVoiceMessage,
      setActiveConversationId: state.setActiveConversationId,
      sendMediaMessage: state.sendMediaMessage,
      token: state.token,
      user: state.user,
    }))
  );
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);
  const [directoryMode, setDirectoryMode] = useState<DirectoryMode>('all');
  const [mobilePane, setMobilePane] = useState<MobilePane>('directory');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [actionCategory, setActionCategory] = useState<OperationalActionCategory>('root');
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recorderMessage, setRecorderMessage] = useState<string | null>(null);
  const [voiceSearchState, setVoiceSearchState] = useState<VoiceSearchState>('idle');
  const [voiceSearchSeconds, setVoiceSearchSeconds] = useState(0);
  const [voiceSearchMessage, setVoiceSearchMessage] = useState<string | null>(null);
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

  useEffect(() => {
    if (Platform.OS !== 'web' || !user) return;

    const socket = io(SOCKET_URL, {
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'],
      timeout: 15000,
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.45,
    });
    socketRef.current = socket;

    const resetPeerConnection = () => {
      if (peerRef.current) {
        peerRef.current.onicecandidate = null;
        peerRef.current.ontrack = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.close();
        peerRef.current = null;
      }
    };

    const buildPeerConnection = (
      roomId: string,
      targetSocketId: string,
      mode: CallMode
    ) => {
      resetPeerConnection();

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      const localStream = localStreamRef.current;

      if (localStream) {
        localStream.getTracks().forEach((track) => {
          peer.addTrack(track, localStream);
        });
      }

      peer.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        socket.emit('rtc:ice-candidate', {
          candidate: event.candidate.toJSON(),
          roomId,
          targetSocketId,
        });
      };

      peer.ontrack = (event) => {
        setCallSession((current) => {
          if (current?.roomId === roomId) {
            return {
              ...current,
              phase: 'connected',
              remoteStream: event.streams[0],
              remoteSocketId: targetSocketId,
            };
          }

          return {
            roomId,
            mode,
            phase: 'connected',
            joinedAt: Date.now(),
            remoteStream: event.streams[0],
            remoteSocketId: targetSocketId,
          };
        });
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          setCallSession((current) =>
            current
              ? {
                  ...current,
                  phase: 'connected',
                }
              : current
          );
          setCallNotice(mode === 'video' ? 'Videollamada activa.' : 'Llamada activa.');
        }

        if (
          peer.connectionState === 'failed' ||
          peer.connectionState === 'closed' ||
          peer.connectionState === 'disconnected'
        ) {
          resetPeerConnection();
          setCallSession((current) =>
            current
              ? {
                  ...current,
                  phase: 'waiting',
                  remoteStream: null,
                  remoteSocketId: null,
                }
              : current
          );
        }
      };

      peerRef.current = peer;
      return peer;
    };

    socket.on(
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
            current
              ? {
                  ...current,
                  phase: 'waiting',
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
        const offer = await peer.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: mode === 'video',
        });
        await peer.setLocalDescription(offer);
        socket.emit('rtc:offer', {
          offer,
          roomId: payload.roomId,
          targetSocketId: targetParticipant.socketId,
          mode,
          initiatedBy: user.id,
          userId: user.id,
        });
        setCallSession((current) =>
          current
            ? {
                ...current,
                phase: 'connecting',
                remoteSocketId: targetParticipant.socketId,
              }
            : current
        );
      }
    );

    socket.on(
      'rtc:offer',
      async (payload: {
        fromSocketId: string;
        offer: RTCSessionDescriptionInit;
        roomId: string;
        mode?: CallMode;
      }) => {
        if (payload.roomId !== joinedRtcRoomRef.current || !localStreamRef.current) {
          return;
        }

        const mode = payload.mode || currentCallModeRef.current || 'audio';
        const peer = buildPeerConnection(payload.roomId, payload.fromSocketId, mode);
        await peer.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('rtc:answer', {
          answer,
          roomId: payload.roomId,
          targetSocketId: payload.fromSocketId,
          mode,
        });
        setCallSession((current) =>
          current
            ? {
                ...current,
                phase: 'connecting',
                remoteSocketId: payload.fromSocketId,
              }
            : current
        );
      }
    );

    socket.on(
      'rtc:answer',
      async (payload: { answer: RTCSessionDescriptionInit; roomId: string }) => {
        if (payload.roomId !== joinedRtcRoomRef.current || !peerRef.current) {
          return;
        }

        await peerRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
      }
    );

    socket.on('rtc:ice-candidate', async (payload: { candidate: RTCIceCandidateInit }) => {
      if (peerRef.current) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    });

    socket.on('rtc:hangup', (payload: { roomId: string }) => {
      if (payload.roomId !== joinedRtcRoomRef.current) {
        return;
      }

      resetPeerConnection();
      setCallSession((current) =>
        current
          ? {
              ...current,
              phase: 'waiting',
              remoteStream: null,
              remoteSocketId: null,
            }
          : current
      );
      setCallNotice('La otra persona salio de la llamada.');
    });

    socket.on('disconnect', () => {
      setCallParticipants([]);
      setCallNotice('Reconectando senal de llamada...');
    });

    socket.io.on('reconnect', () => {
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
    });

    return () => {
      resetPeerConnection();
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    };
  }, [token, user]);

  const webRecorderRef = useRef<any>(null);
  const webStreamRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef<number | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchWebRecorderRef = useRef<any>(null);
  const searchWebStreamRef = useRef<any>(null);
  const searchWebChunksRef = useRef<Blob[]>([]);
  const searchStartedAtRef = useRef<number | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bootstrappedRef = useRef(false);
  const nativeVoiceRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const nativeSearchRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
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
        loadConversation(preferredConversation.id);
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
    loadConversation(fallbackConversation.id);
  }, [activeConversationId, chatConversations, loadConversation, setActiveConversationId]);

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
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
      }
      nativeVoiceRecorder.stop().catch(() => undefined);
      nativeSearchRecorder.stop().catch(() => undefined);
      webRecorderRef.current?.stop?.();
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      searchWebRecorderRef.current?.stop?.();
      searchWebStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
    };
  }, [nativeSearchRecorder, nativeVoiceRecorder]);

  const {
    activeContact,
    activeConversation,
    activeConversationKey,
    activeMessageItems,
    activeMessages,
    conversationFilterCounts,
    directoryHelperText,
    directoryItems,
    filteredContacts,
    searchTerm,
    visibleContacts,
    visibleListCount,
  } = useChatDirectoryData({
    activeConversationId,
    chatContacts,
    chatConversations,
    directoryMode,
    messagesByConversation,
    pendingTextMessages,
    search,
    userId: user?.id,
  });
  const composerPlaceholder = 'Escribe un mensaje...';
  const supportsMicrophoneCapture =
    Platform.OS !== 'web' ||
    (typeof globalThis !== 'undefined' &&
      Boolean((globalThis as any).navigator?.mediaDevices?.getUserMedia) &&
      typeof (globalThis as any).MediaRecorder !== 'undefined');
  const canSendText =
    Boolean(activeConversation && draft.trim()) && recordingState === 'idle' && !isSubmitting;
  const canRecord =
    voiceSearchState === 'idle' && recordingState !== 'uploading' && supportsMicrophoneCapture;
  const canUseVoiceSearch =
    recordingState === 'idle' && voiceSearchState !== 'processing' && supportsMicrophoneCapture;
  const supportsRtcCalls =
    Platform.OS === 'web' &&
    typeof globalThis !== 'undefined' &&
    Boolean((globalThis as any).navigator?.mediaDevices?.getUserMedia) &&
    typeof (globalThis as any).RTCPeerConnection !== 'undefined';
  const remoteParticipants = useMemo(
    () => callParticipants.filter((participant) => participant.socketId !== socketRef.current?.id),
    [callParticipants]
  );
  const leadRemoteParticipant = remoteParticipants[0] || activeContact || null;
  const activeCallSession =
    activeConversation && callSession?.roomId === activeConversation.id ? callSession : null;
  const canStartRealtimeCall = Boolean(activeConversation) && supportsRtcCalls;
  const callStatusLabel = activeCallSession
    ? activeCallSession.phase === 'connected'
      ? 'En llamada'
      : activeCallSession.phase === 'connecting'
        ? 'Conectando'
        : 'Esperando'
    : 'Listo';
  const callTone: 'positive' | 'warning' | 'neutral' =
    activeCallSession?.phase === 'connected'
      ? 'positive'
      : activeCallSession
        ? 'warning'
        : 'neutral';
  const activeConversationCallMode = activeCallSession?.mode ?? null;
  const sortedOperationalContacts = useMemo(
    () =>
      [...chatContacts].sort((left, right) => {
        const statusDiff = getOperationalStatusRank(left.status) - getOperationalStatusRank(right.status);

        if (statusDiff) {
          return statusDiff;
        }

        return left.name.localeCompare(right.name);
      }),
    [chatContacts]
  );
  const activeStatusChips = useMemo(
    () => [
      {
        icon: 'circle',
        label: activeConversation ? getConversationPresenceLabel(activeConversation, activeContact) : 'Sin canal',
        tone: activeConversation ? getOperationalStatusTone(activeContact?.status || 'online') : 'neutral',
      },
      {
        icon: 'shield-lock-outline',
        label: 'Cifrado',
        tone: 'positive',
      },
      {
        icon: socketRef.current?.connected ? 'access-point' : 'access-point-off',
        label: socketRef.current?.connected ? 'Socket activo' : 'Reconectando',
        tone: socketRef.current?.connected ? 'positive' : 'warning',
      },
    ],
    [activeContact, activeConversation]
  );

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

  const startVoiceSearchTicker = () => {
    searchStartedAtRef.current = Date.now();
    setVoiceSearchSeconds(0);

    if (searchTimerRef.current) {
      clearInterval(searchTimerRef.current);
    }

    searchTimerRef.current = setInterval(() => {
      if (!searchStartedAtRef.current) {
        return;
      }

      const elapsedSeconds = Math.max(
        1,
        Math.round((Date.now() - searchStartedAtRef.current) / 1000)
      );

      setVoiceSearchSeconds(elapsedSeconds);

      if (elapsedSeconds >= MAX_VOICE_SEARCH_SECONDS) {
        if (searchTimerRef.current) {
          clearInterval(searchTimerRef.current);
          searchTimerRef.current = null;
        }

        setVoiceSearchMessage(
          `Limite de ${MAX_VOICE_SEARCH_SECONDS}s alcanzado. Procesando audio...`
        );
        (Platform.OS === 'web' ? stopWebVoiceSearch() : stopNativeVoiceSearch());
      }
    }, 400);
  };

  const stopVoiceSearchTicker = () => {
    if (searchTimerRef.current) {
      clearInterval(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    searchStartedAtRef.current = null;
    setVoiceSearchSeconds(0);
  };

  const applyVoiceSearchTranscript = (transcript: string) => {
    const normalizedTranscript = transcript.replace(/\s+/g, ' ').trim();

    if (!normalizedTranscript) {
      setVoiceSearchMessage('No se detecto texto util en el audio de busqueda.');
      return;
    }

    setSearch(normalizedTranscript);
    setDirectoryMode('all');

    if (isCompact) {
      setMobilePane('directory');
    }

    setVoiceSearchMessage(`Busqueda por voz aplicada: "${normalizedTranscript}"`);
  };

  const handleSelectConversation = async (conversationId: string) => {
    setActiveConversationId(conversationId);
    await loadConversation(conversationId);

    if (isCompact) {
      setMobilePane('conversation');
    }
  };

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

  const handleOpenRadioFromChat = async () => {
    if (!activeConversation) {
      return;
    }

    setAttachmentNotice('Conectando canal de radio...');

    if (activeConversation.kind === 'direct' && activeContact?.id) {
      await openDirectConversation(activeContact.id, 'radio');
    } else {
      await openGeneralConversation('radio');
    }

    setAttachmentNotice('Canal de radio listo. Usa Radio para PTT dedicado.');
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
    setDraft('');

    const result = await sendMessage(activeConversation.id, text);

    if (!result || result.ok) {
      setPendingTextMessages((current) => current.filter((message) => message.id !== localId));
      return;
    }

    setPendingTextMessages((current) =>
      current.map((message) =>
        message.id === localId
          ? {
              ...message,
              localStatus: 'failed',
            }
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

  const handleAttachmentUnavailable = (label: string) => {
    setAttachmentNotice(`${label} en preparacion. Se conectara cuando exista soporte de backend/picker.`);
  };

  const handlePickMedia = async (type: 'image' | 'video', source: 'library' | 'camera' = 'library') => {
    if (!activeConversation) return;

    setAttachmentMenuOpen(false);
    setAttachmentNotice(type === 'image' ? 'Preparando imagen...' : 'Preparando video...');

    try {
      const resultMessage = await sendPickedChatMedia({
        activeConversationId: activeConversation.id,
        draft,
        sendMediaMessage,
        source,
        type,
      });

      if (resultMessage.clearDraft) {
        setDraft('');
      }

      setAttachmentNotice(resultMessage.notice);
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : 'No fue posible preparar el archivo.');
    }
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

  const ensureLocalCallStream = async (mode: CallMode) => {
    if (Platform.OS !== 'web') {
      setCallNotice('Las llamadas en vivo estan disponibles en la version web.');
      return null;
    }

    const mediaDevices = (globalThis as any).navigator?.mediaDevices;

    if (!mediaDevices?.getUserMedia) {
      setCallNotice('Este navegador no soporta llamadas en vivo.');
      return null;
    }

    const needsVideo = mode === 'video';
    const currentStream = localStreamRef.current;
    const currentHasVideo = Boolean(currentStream?.getVideoTracks().length);

    if (currentStream && currentHasVideo === needsVideo) {
      currentCallModeRef.current = mode;
      setIsCameraEnabled(currentHasVideo);
      setIsCallMuted(false);
      currentStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      currentStream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
      return currentStream;
    }

    stopLocalCallTracks();
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: needsVideo ? { facingMode: 'user' } : false,
    });

    localStreamRef.current = stream;
    currentCallModeRef.current = mode;
    setIsCallMuted(false);
    setIsCameraEnabled(needsVideo);
    return stream;
  };

  const closeActiveCall = async (
    options: {
      emitHangup?: boolean;
      reason?: string | null;
    } = {}
  ) => {
    const { emitHangup = true, reason = null } = options;
    const roomId = joinedRtcRoomRef.current;

    if (roomId && socketRef.current) {
      if (emitHangup) {
        socketRef.current.emit('rtc:hangup', { roomId });
      }

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

  const handleStartCall = async (mode: CallMode) => {
    if (!activeConversation) {
      return;
    }

    if (!supportsRtcCalls) {
      setCallNotice(
        Platform.OS === 'web'
          ? 'Este navegador no soporta llamadas en vivo.'
          : 'Llamadas proximamente en Android. Esta funcion necesita WebRTC nativo.'
      );
      return;
    }

    if (
      callSession &&
      callSession.roomId === activeConversation.id &&
      callSession.mode === mode
    ) {
      setCallNotice(
        mode === 'video'
          ? 'La videollamada ya esta abierta en este chat.'
          : 'La llamada ya esta abierta en este chat.'
      );
      return;
    }

    if (callSession) {
      await closeActiveCall({ emitHangup: true });
    }

    try {
      setCallNotice(
        mode === 'video'
          ? 'Preparando camara y microfono...'
          : 'Preparando cabina de voz...'
      );

      const localStream = await ensureLocalCallStream(mode);

      if (!localStream || !socketRef.current) {
        return;
      }

      const joinedAt = Date.now();
      joinedRtcRoomRef.current = activeConversation.id;
      currentCallModeRef.current = mode;
      setCallParticipants([]);
      setCallSession({
        roomId: activeConversation.id,
        mode,
        phase: 'waiting',
        joinedAt,
        remoteStream: null,
        remoteSocketId: null,
      });
      syncCallTimer(joinedAt);

      socketRef.current.emit('rtc:join', {
        name: user?.name,
        roomId: activeConversation.id,
        userId: user?.id,
      });

      const recentCallAnnouncement = activeMessages
        .slice(-4)
        .some((message) =>
          /videollamada|llamada de voz|llamada en este chat/.test(
            `${message.text || ''} ${message.textPreview || ''}`.toLowerCase()
          )
        );

      if (!recentCallAnnouncement) {
        await sendMessage(
          activeConversation.id,
          mode === 'video'
            ? 'Inicie una videollamada en este chat. Usa el panel de cabina para unirte.'
            : 'Inicie una llamada de voz en este chat. Usa el panel de cabina para unirte.'
        );
      }

      setCallNotice(
        mode === 'video'
          ? 'Videollamada lista. Cuando alguien se una, aparecera aqui.'
          : 'Llamada lista. Cuando alguien se una, aparecera aqui.'
      );
    } catch (error) {
      await closeActiveCall({ emitHangup: false });
      setCallNotice(
        error instanceof Error
          ? error.message
          : 'No fue posible iniciar la llamada en este momento.'
      );
    }
  };

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

  const buildNativeVoiceSearchFormData = async (uri: string) => {
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: `voice-search-${Date.now()}.m4a`,
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

    await sendVoiceMessage(activeConversation.id, formData);
    setDraft('');
    setRecorderMessage('Nota de voz enviada.');
    setRecordingState('idle');
  };

  const startNativeVoiceSearch = async () => {
    const permission = await requestRecordingPermissionsAsync();

    if (!permission.granted) {
      setVoiceSearchMessage('La app necesita permiso de microfono para buscar por voz.');
      return;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });

    await nativeSearchRecorder.prepareToRecordAsync();
    nativeSearchRecorder.record();
    startVoiceSearchTicker();
    setVoiceSearchMessage('Escuchando busqueda por voz...');
    setVoiceSearchState('recording');
  };

  const stopNativeVoiceSearch = async () => {
    setVoiceSearchState('processing');
    await nativeSearchRecorder.stop();
    const status = nativeSearchRecorder.getStatus();
    const uri = status.url || nativeSearchRecorder.uri;
    stopVoiceSearchTicker();
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });

    if (!uri) {
      setVoiceSearchMessage('No se pudo recuperar el audio de busqueda.');
      setVoiceSearchState('idle');
      return;
    }

    setVoiceSearchMessage('Transcribiendo busqueda por voz...');
    const formData = await buildNativeVoiceSearchFormData(uri);
    const transcript = await transcribeVoiceSearchRequest(formData);
    applyVoiceSearchTranscript(transcript);
    setVoiceSearchState('idle');
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
        await sendVoiceMessage(activeConversation.id, formData);
        resolve();
      };
      recorder.stop();
    });

    webRecorderRef.current = null;
    webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
    webStreamRef.current = null;
    webChunksRef.current = [];
    stopRecordingTicker();
    setDraft('');
    setRecorderMessage('Nota de voz enviada.');
    setRecordingState('idle');
  };

  const startWebVoiceSearch = async () => {
    const runtime = globalThis as any;
    const mediaDevices = runtime.navigator?.mediaDevices;
    const MediaRecorderCtor = runtime.MediaRecorder;

    if (!mediaDevices?.getUserMedia || !MediaRecorderCtor) {
      setVoiceSearchMessage('Este navegador no soporta busqueda por voz.');
      return;
    }

    const stream = await mediaDevices.getUserMedia({
      audio: true,
    });
    const preferredMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
      (mimeType) =>
        typeof MediaRecorderCtor.isTypeSupported === 'function'
          ? MediaRecorderCtor.isTypeSupported(mimeType)
          : mimeType === 'audio/webm'
    );
    const recorder = preferredMimeType
      ? new MediaRecorderCtor(stream, { mimeType: preferredMimeType })
      : new MediaRecorderCtor(stream);

    searchWebStreamRef.current = stream;
    searchWebRecorderRef.current = recorder;
    searchWebChunksRef.current = [];
    recorder.ondataavailable = (event: any) => {
      if (event.data?.size) {
        searchWebChunksRef.current.push(event.data);
      }
    };

    recorder.start();
    startVoiceSearchTicker();
    setVoiceSearchMessage('Escuchando busqueda por voz...');
    setVoiceSearchState('recording');
  };

  const stopWebVoiceSearch = async () => {
    if (!searchWebRecorderRef.current) {
      return;
    }

    setVoiceSearchState('processing');
    setVoiceSearchMessage('Transcribiendo busqueda por voz...');
    const recorder = searchWebRecorderRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';

    try {
      const transcript = await new Promise<string>((resolve, reject) => {
        recorder.onstop = async () => {
          try {
            const blob = new Blob(searchWebChunksRef.current, {
              type: mimeType,
            });
            const file = new File([blob], `voice-search-${Date.now()}.webm`, {
              type: mimeType,
            });
            const formData = new FormData();
            formData.append('file', file);
            resolve(await transcribeVoiceSearchRequest(formData));
          } catch (error) {
            reject(error);
          }
        };
        recorder.onerror = (event: any) => {
          reject(event?.error || new Error('No fue posible capturar el audio de busqueda.'));
        };
        recorder.stop();
      });

      applyVoiceSearchTranscript(transcript);
    } finally {
      searchWebRecorderRef.current = null;
      searchWebStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      searchWebStreamRef.current = null;
      searchWebChunksRef.current = [];
      stopVoiceSearchTicker();
      setVoiceSearchState('idle');
    }
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

  const handleVoiceSearchAction = async () => {
    if (!canUseVoiceSearch) {
      return;
    }

    try {
      if (voiceSearchState === 'recording') {
        if (Platform.OS === 'web') {
          await stopWebVoiceSearch();
          return;
        }

        await stopNativeVoiceSearch();
        return;
      }

      if (Platform.OS === 'web') {
        await startWebVoiceSearch();
        return;
      }

      await startNativeVoiceSearch();
    } catch (error) {
      stopVoiceSearchTicker();
      setVoiceSearchState('idle');
      setVoiceSearchMessage(
        error instanceof Error ? error.message : 'No fue posible completar la busqueda por voz.'
      );
    }
  };

  useEffect(() => {
    if (!callSession) {
      stopCallTimer();
      return;
    }

    syncCallTimer(callSession.joinedAt);
    return () => {
      stopCallTimer();
    };
  }, [callSession]);

  useEffect(() => {
    if (!callSession || !activeConversation) {
      return;
    }

    if (callSession.roomId !== activeConversation.id) {
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
      setCallNotice('La llamada se cerro al cambiar de chat.');
    }
  }, [activeConversation, callSession]);

  const showDirectoryPanel = !isCompact || mobilePane === 'directory';
  const showConversationPanel = !isCompact || mobilePane === 'conversation';
  const isMobileConversation = isCompact && mobilePane === 'conversation';

  return {
    actionCategory,
    activeAudioMessageId,
    activeCallSession,
    activeContact,
    activeConversation,
    activeConversationCallMode,
    activeMessageItems,
    activeStatusChips,
    attachmentMenuOpen,
    attachmentNotice,
    callElapsedSeconds,
    callNotice,
    callParticipants,
    callStatusLabel,
    callTone,
    canRecord,
    canSendText,
    canStartRealtimeCall,
    canUseVoiceSearch,
    closeActiveCall,
    composerPlaceholder,
    conversationFilterCounts,
    directoryHelperText,
    directoryItems,
    directoryMode,
    draft,
    filteredContacts,
    handleAttachmentUnavailable,
    handleMessagesContentSizeChange,
    handleMessagesLayout,
    handleMessagesScroll,
    handleOpenDirect,
    handleOpenGeneral,
    handleOpenRadioFromChat,
    handlePickMedia,
    handleRetryTextMessage,
    handleSelectConversation,
    handleSendText,
    handleStartCall,
    handleVoiceAction,
    handleVoiceSearchAction,
    isCallMuted,
    isCameraEnabled,
    isCompact,
    isMobileConversation,
    isNearMessagesBottomRef,
    isPhone,
    isSubmitting,
    leadRemoteParticipant,
    localStreamRef,
    messagesListRef,
    mobilePane,
    optionsMenuOpen,
    recordingSeconds,
    recordingState,
    recorderMessage,
    remoteParticipants,
    scrollMessagesToEnd,
    search,
    searchTerm,
    setActionCategory,
    setActiveAudioMessageId,
    setAttachmentMenuOpen,
    setCallNotice,
    setDirectoryMode,
    setDraft,
    setMobilePane,
    setOptionsMenuOpen,
    setSearch,
    showConversationPanel,
    showDirectoryPanel,
    sortedOperationalContacts,
    styles,
    theme,
    toggleCallMute,
    toggleCamera,
    token,
    user,
    visibleContacts,
    visibleListCount,
    voiceSearchMessage,
    voiceSearchSeconds,
    voiceSearchState,
  };
}
