import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import * as ImagePicker from '@/src/native/image-picker';
import { useVideoPlayer, VideoView } from '@/src/native/video';
import { io, type Socket } from 'socket.io-client';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from '@/src/native/audio';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { resolveAssetUrl, transcribeVoiceSearchRequest, SOCKET_URL } from '@/src/api/client';
import { AppShell } from '@/src/components/app-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type {
  ChatDirectoryContact,
  ChatMessage,
  ConversationChannelMode,
  ConversationSummary,
} from '@/src/types/app';
import { formatRelativeTime, formatRole, formatStatus } from '@/src/utils/format';

type DirectoryMode = 'all' | 'unread' | 'groups' | 'direct';
type MobilePane = 'directory' | 'conversation';
type RecordingState = 'idle' | 'recording' | 'uploading';
type VoiceSearchState = 'idle' | 'recording' | 'processing';
type CallMode = 'audio' | 'video';
type CallPhase = 'waiting' | 'connecting' | 'connected';
type RtcParticipant = {
  socketId: string;
  userId: string;
  name: string;
};
type CallSession = {
  roomId: string;
  mode: CallMode;
  phase: CallPhase;
  joinedAt: number;
  remoteStream: MediaStream | null;
  remoteSocketId: string | null;
};
const MAX_VOICE_NOTE_SECONDS = 45;
const MAX_VOICE_SEARCH_SECONDS = 12;

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getConversationContact(conversation: ConversationSummary, currentUserId?: string | null) {
  const others = conversation.participants.filter((participant) => participant.id !== currentUserId);
  const preferredDriver = others.find((participant) => participant.role === 'driver');

  return preferredDriver || others[0] || conversation.participants[0] || null;
}

function getConversationIconName(conversation: ConversationSummary) {
  return conversation.kind === 'group' ? 'account-group-outline' : 'message-text-outline';
}

function getConversationLabel(conversation: ConversationSummary) {
  return conversation.kind === 'group' ? 'Grupo operativo' : 'Chat directo';
}

function getConversationPreview(conversation: ConversationSummary) {
  if (!conversation.lastMessage) {
    return 'Sin mensajes recientes.';
  }

  return conversation.lastMessage.textPreview || conversation.lastMessage.text || 'Actualizacion protegida';
}

function getConversationLastActivityTime(conversation: ConversationSummary) {
  const lastTimestamp = conversation.lastMessage?.createdAt;

  if (!lastTimestamp) {
    return 0;
  }

  const parsedDate = new Date(lastTimestamp).getTime();
  return Number.isFinite(parsedDate) ? parsedDate : 0;
}

function getContactSearchText(contact: ChatDirectoryContact) {
  return `${contact.name} ${contact.email} ${contact.phone} ${contact.role}`.toLowerCase();
}

export function ChatScreen() {
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
    void loadChatContacts();
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
        void loadConversation(preferredConversation.id);
      }

      return;
    }

    bootstrappedRef.current = true;
    void openGeneralConversation('chat').then((conversation) => {
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
    void loadConversation(fallbackConversation.id);
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
      void nativeVoiceRecorder.stop().catch(() => undefined);
      void nativeSearchRecorder.stop().catch(() => undefined);
      webRecorderRef.current?.stop?.();
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      searchWebRecorderRef.current?.stop?.();
      searchWebStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
    };
  }, [nativeSearchRecorder, nativeVoiceRecorder]);

  const activeConversation =
    chatConversations.find((conversation) => conversation.id === activeConversationId) ||
    chatConversations[0] ||
    null;
  const activeMessages = activeConversation ? messagesByConversation[activeConversation.id] || [] : [];
  const activeContact = activeConversation ? getConversationContact(activeConversation, user?.id) : null;
  const searchTerm = search.trim().toLowerCase();
  const conversationFilterCounts = useMemo(
    () => ({
      all: chatConversations.length,
      unread: chatConversations.filter((conversation) => conversation.unreadCount > 0).length,
      groups: chatConversations.filter((conversation) => conversation.kind === 'group').length,
      direct: chatConversations.filter((conversation) => conversation.kind === 'direct').length,
    }),
    [chatConversations]
  );
  const filteredConversations = useMemo(() => {
    const visibleConversations = chatConversations.filter((conversation) => {
      if (directoryMode === 'unread' && conversation.unreadCount === 0) {
        return false;
      }

      if (directoryMode === 'groups' && conversation.kind !== 'group') {
        return false;
      }

      if (directoryMode === 'direct' && conversation.kind !== 'direct') {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const contact = getConversationContact(conversation, user?.id);
      const searchableText = [
        conversation.title,
        conversation.description || '',
        getConversationPreview(conversation),
        contact?.name || '',
        ...(messagesByConversation[conversation.id] || []).flatMap((message) => [
          message.text || '',
          message.textPreview || '',
          message.transcript || '',
        ]),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });

    return visibleConversations.sort((left, right) => {
      const activeDiff =
        Number(right.id === activeConversationId) - Number(left.id === activeConversationId);

      if (activeDiff) {
        return activeDiff;
      }

      const unreadDiff = right.unreadCount - left.unreadCount;

      if (unreadDiff) {
        return unreadDiff;
      }

      const lastActivityDiff =
        getConversationLastActivityTime(right) - getConversationLastActivityTime(left);

      if (lastActivityDiff) {
        return lastActivityDiff;
      }

      return left.title.localeCompare(right.title);
    });
  }, [activeConversationId, chatConversations, directoryMode, messagesByConversation, searchTerm, user?.id]);
  const filteredContacts = useMemo(() => {
    if (directoryMode === 'groups' || directoryMode === 'unread') {
      return [];
    }

    return chatContacts.filter((contact) => {
      if (!searchTerm) {
        return true;
      }

      return getContactSearchText(contact).includes(searchTerm);
    });
  }, [chatContacts, directoryMode, searchTerm]);
  const totalUnread = useMemo(
    () => chatConversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    [chatConversations]
  );
  const directoryHelperText = searchTerm
    ? `Mostrando ${filteredConversations.length} chats y ${filteredContacts.length} contactos relacionados con "${search.trim()}".`
    : directoryMode === 'unread'
      ? 'Vista priorizada para responder pendientes antes y detectar actividad critica.'
      : 'Vista priorizada por pendientes y actividad reciente para ubicar primero lo importante.';
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
  const callTone =
    activeCallSession?.phase === 'connected'
      ? 'positive'
      : activeCallSession
        ? 'warning'
        : 'neutral';
  const activeConversationCallMode = activeCallSession?.mode ?? null;
  const conversationCallHint =
    callNotice ||
    (canStartRealtimeCall
      ? 'Usa voz o video desde los iconos del encabezado para abrir la cabina sin perder el contexto.'
      : 'Las llamadas y videollamadas en vivo se habilitan cuando entras a la version web del chat.');

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
        void (Platform.OS === 'web' ? stopWebRecording() : stopNativeRecording());
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
        void (Platform.OS === 'web' ? stopWebVoiceSearch() : stopNativeVoiceSearch());
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

  const handleSendText = async () => {
    if (!activeConversation || !draft.trim()) {
      return;
    }

    await sendMessage(activeConversation.id, draft.trim());
    setDraft('');
  };

  const handlePickMedia = async (type: 'image' | 'video') => {
    if (!activeConversation) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [type === 'image' ? 'images' : 'videos'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('caption', draft.trim());

      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append('file', blob, asset.fileName || (type === 'image' ? 'image.jpg' : 'video.mp4'));
      } else {
        formData.append('file', {
          uri: asset.uri,
          name: asset.fileName || (type === 'image' ? 'image.jpg' : 'video.mp4'),
          type: asset.mimeType || (type === 'image' ? 'image/jpeg' : 'video/mp4'),
        } as any);
      }

      await sendMediaMessage(activeConversation.id, formData);
      setDraft('');
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
      setCallNotice('Las llamadas y videollamadas viven en la version web de este chat.');
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

  return (
    <AppShell
      scroll={false}
      contentContainerStyle={[
        styles.container,
        isMobileConversation ? styles.containerConversationOnly : undefined,
      ]}
      header={
        isMobileConversation ? null : (
        <View style={styles.header}>
          <Text style={styles.title}>Mensajeria operativa</Text>
          <Text style={styles.subtitle}>
            Coordina mensajes, archivos, llamadas y videollamadas sin salir de la misma consola.
          </Text>
          <View style={styles.headerPills}>
            <StatusPill label={`${chatConversations.length} chats`} tone="info" />
            <StatusPill
              label={totalUnread ? `${totalUnread} pendientes` : 'Todo al dia'}
              tone={totalUnread ? 'warning' : 'positive'}
            />
            <StatusPill label="Cifrado protegido" tone="neutral" />
          </View>
        </View>
        )
      }>
      {isCompact && !isMobileConversation ? (
        <View style={styles.mobileSwitch}>
          <Pressable
            onPress={() => setMobilePane('directory')}
            style={[
              styles.mobileSwitchButton,
              mobilePane === 'directory' ? styles.mobileSwitchButtonActive : undefined,
            ]}>
            <MaterialCommunityIcons
              name="view-list-outline"
              size={18}
              color={mobilePane === 'directory' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[
                styles.mobileSwitchLabel,
                mobilePane === 'directory' ? styles.mobileSwitchLabelActive : undefined,
              ]}>
              Canales
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMobilePane('conversation')}
            style={[
              styles.mobileSwitchButton,
              mobilePane === 'conversation' ? styles.mobileSwitchButtonActive : undefined,
            ]}>
            <MaterialCommunityIcons
              name="message-reply-text-outline"
              size={18}
              color={mobilePane === 'conversation' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[
                styles.mobileSwitchLabel,
                mobilePane === 'conversation' ? styles.mobileSwitchLabelActive : undefined,
              ]}>
              Conversacion
            </Text>
          </Pressable>
        </View>
        ) : null}

      <View style={styles.layout}>
        {showDirectoryPanel ? (
          <View style={styles.directoryPanel}>
            <View style={styles.searchShell}>
              <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar canal, contacto o rol"
                placeholderTextColor={theme.colors.muted}
                style={styles.searchInput}
                testID="chat-search-input"
              />
              {searchTerm ? (
                <Pressable
                  onPress={() => setSearch('')}
                  style={styles.searchClearButton}
                  accessibilityLabel="Limpiar busqueda">
                  <MaterialCommunityIcons name="close" size={16} color={theme.colors.muted} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => void handleVoiceSearchAction()}
                disabled={!canUseVoiceSearch}
                style={[
                  styles.searchVoiceButton,
                  voiceSearchState === 'recording'
                    ? styles.searchVoiceButtonActive
                    : voiceSearchState === 'processing'
                      ? styles.searchVoiceButtonLoading
                      : undefined,
                  !canUseVoiceSearch ? styles.searchVoiceButtonDisabled : undefined,
                ]}
                testID="chat-voice-search-button">
                {voiceSearchState === 'processing' ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <MaterialCommunityIcons
                    name={voiceSearchState === 'recording' ? 'stop-circle-outline' : 'microphone'}
                    size={18}
                    color="#FFFFFF"
                  />
                )}
              </Pressable>
            </View>

            {voiceSearchMessage ? (
              <View style={styles.searchMetaRow}>
                <MaterialCommunityIcons
                  name={voiceSearchState === 'recording' ? 'record-rec' : 'waveform'}
                  size={16}
                  color={
                    voiceSearchState === 'recording' ? theme.colors.accent : theme.colors.info
                  }
                />
                <Text style={styles.searchMetaText}>
                  {voiceSearchState === 'recording'
                    ? `${voiceSearchMessage} ${formatDuration(voiceSearchSeconds)} / ${formatDuration(MAX_VOICE_SEARCH_SECONDS)}`
                    : voiceSearchMessage}
                </Text>
              </View>
            ) : (
              <Text style={styles.searchHintText}>
                Usa el microfono para dictar una busqueda y filtrar canales o contactos al instante.
              </Text>
            )}

            <View style={styles.modeRow}>
              {[
                {
                  key: 'all',
                  label: 'Todo',
                  icon: 'view-dashboard-outline',
                  count: conversationFilterCounts.all,
                },
                {
                  key: 'unread',
                  label: 'Pendientes',
                  icon: 'bell-outline',
                  count: conversationFilterCounts.unread,
                },
                {
                  key: 'groups',
                  label: 'Grupal',
                  icon: 'account-group-outline',
                  count: conversationFilterCounts.groups,
                },
                {
                  key: 'direct',
                  label: 'Directo',
                  icon: 'account-outline',
                  count: conversationFilterCounts.direct,
                },
              ].map(({ key, label, icon, count }) => (
                <Pressable
                  key={key}
                  onPress={() => setDirectoryMode(key as DirectoryMode)}
                  style={[
                    styles.modeChip,
                    directoryMode === key ? styles.modeChipActive : undefined,
                  ]}>
                  <View style={styles.modeChipCopy}>
                    <MaterialCommunityIcons
                      name={icon as any}
                      size={16}
                      color={directoryMode === key ? '#FFFFFF' : theme.colors.muted}
                    />
                    <Text
                      style={[
                        styles.modeChipText,
                        directoryMode === key ? styles.modeChipTextActive : undefined,
                      ]}>
                      {label}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.modeChipCount,
                      directoryMode === key ? styles.modeChipCountActive : undefined,
                    ]}>
                    <Text
                      style={[
                        styles.modeChipCountText,
                        directoryMode === key ? styles.modeChipCountTextActive : undefined,
                      ]}>
                      {count}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={styles.filterSummaryRow}>
              <MaterialCommunityIcons
                name={searchTerm ? 'tune-variant' : 'clock-outline'}
                size={16}
                color={theme.colors.muted}
              />
              <Text style={styles.filterSummaryText}>{directoryHelperText}</Text>
            </View>

            <ScrollView
              style={styles.directoryScroll}
              contentContainerStyle={styles.directoryContent}
              showsVerticalScrollIndicator={false}>
              <View style={styles.sectionBlock}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Conversaciones activas</Text>
                  <StatusPill label={`${filteredConversations.length}`} tone="info" />
                </View>

                {directoryMode !== 'direct' && directoryMode !== 'unread' ? (
                  <Pressable
                    onPress={() => void handleOpenGeneral('chat')}
                    style={styles.quickActionCard}>
                    <View style={styles.quickActionCopy}>
                      <Text style={styles.quickActionTitle}>Abrir grupo general</Text>
                      <Text style={styles.quickActionBody}>
                        Coordinacion tipo WhatsApp para anuncios, seguimiento y respuesta rapida.
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name="account-group-outline"
                      size={22}
                      color={theme.colors.info}
                    />
                  </Pressable>
                ) : null}

                {filteredConversations.length ? filteredConversations.map((conversation) => {
                  const contact = getConversationContact(conversation, user?.id);
                  const isActive = conversation.id === activeConversation?.id;
                  const preview = getConversationPreview(conversation);

                  return (
                    <Pressable
                      key={conversation.id}
                      onPress={() => {
                        void handleSelectConversation(conversation.id);
                      }}
                      style={[
                        styles.conversationTile,
                        isActive ? styles.conversationTileActive : undefined,
                      ]}>
                      <View style={styles.tileLead}>
                        {conversation.kind === 'direct' && contact ? (
                          <UserAvatar user={contact} status={contact.status} showStatus size={48} />
                        ) : (
                          <View style={styles.groupAvatar}>
                            <MaterialCommunityIcons
                              name={getConversationIconName(conversation)}
                              size={20}
                              color={theme.colors.info}
                            />
                          </View>
                        )}
                        <View style={styles.tileCopy}>
                          <View style={styles.tileTitleRow}>
                            <Text style={styles.tileTitle} numberOfLines={1}>
                              {conversation.title}
                            </Text>
                            <Text style={styles.tileTime} numberOfLines={1}>
                              {conversation.lastMessage?.createdAt
                                ? formatRelativeTime(conversation.lastMessage.createdAt)
                                : 'Sin actividad'}
                            </Text>
                          </View>
                          <View style={styles.tilePreviewRow}>
                            <Text style={styles.tilePreview} numberOfLines={1}>
                              {preview}
                            </Text>
                            {conversation.unreadCount ? (
                              <View style={styles.unreadBubble}>
                                <Text style={styles.unreadBubbleText}>{conversation.unreadCount}</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.tileFooter}>
                            <Text style={styles.tileMeta} numberOfLines={1}>
                              {getConversationLabel(conversation)}
                              {contact ? ` | ${formatRole(contact.role)}` : ''}
                            </Text>
                            <View style={styles.tilePills}>
                              {conversation.encrypted ? <StatusPill label="Protegido" tone="neutral" /> : null}
                              <StatusPill label="Texto" tone="info" />
                            </View>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                }) : (
                  <View style={styles.emptyStateCard}>
                    <MaterialCommunityIcons
                      name="message-badge-outline"
                      size={20}
                      color={theme.colors.muted}
                    />
                    <View style={styles.emptyStateCopy}>
                      <Text style={styles.emptyStateTitle}>No hay chats para este filtro</Text>
                      <Text style={styles.emptyStateBody}>
                        Ajusta la busqueda o cambia el filtro para volver a ver conversaciones.
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.sectionBlock}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Directo rapido</Text>
                  <StatusPill label={`${filteredContacts.length}`} tone="info" />
                </View>

                {filteredContacts.length ? (
                  filteredContacts.map((contact) => (
                    <View key={contact.id} style={styles.contactRow}>
                      <View style={styles.tileLead}>
                        <UserAvatar user={contact} status={contact.status} showStatus size={44} />
                        <View style={styles.tileCopy}>
                          <Text style={styles.tileTitle} numberOfLines={1}>
                            {contact.name}
                          </Text>
                          <Text style={styles.tileMeta} numberOfLines={1}>
                            {formatRole(contact.role)} | {formatStatus(contact.status)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.contactActions}>
                        <Pressable
                          onPress={() => void handleOpenDirect(contact.id, 'chat')}
                          style={styles.contactActionButton}>
                          <MaterialCommunityIcons
                            name="message-text-outline"
                            size={18}
                            color={theme.colors.text}
                          />
                        </Pressable>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyStateCard}>
                    <MaterialCommunityIcons
                      name="account-search-outline"
                      size={20}
                      color={theme.colors.muted}
                    />
                    <View style={styles.emptyStateCopy}>
                      <Text style={styles.emptyStateTitle}>Sin contactos listos</Text>
                      <Text style={styles.emptyStateBody}>
                        Prueba con otro termino o cambia el filtro para abrir un directo rapido.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {showConversationPanel ? (
          <View
            style={[
              styles.conversationPanel,
              isMobileConversation ? styles.conversationPanelMobile : undefined,
            ]}>
            {activeConversation ? (
              <>
                <View style={styles.conversationHeader}>
                  <View style={styles.conversationHeaderTop}>
                    <View style={styles.conversationHeaderMain}>
                      {isCompact ? (
                        <Pressable
                          onPress={() => setMobilePane('directory')}
                          style={styles.headerBackButton}
                          accessibilityLabel="Volver a canales">
                          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.colors.text} />
                        </Pressable>
                      ) : null}

                      {activeConversation.kind === 'direct' && activeContact ? (
                        <UserAvatar
                          user={activeContact}
                          status={activeContact.status}
                          showStatus
                          size={isPhone ? 42 : 56}
                        />
                      ) : (
                        <View style={styles.groupAvatarLarge}>
                          <MaterialCommunityIcons
                            name={getConversationIconName(activeConversation)}
                            size={28}
                            color={theme.colors.info}
                          />
                        </View>
                      )}

                      <View style={styles.conversationCopy}>
                        <Text style={styles.conversationTitle}>{activeConversation.title}</Text>
                        <Text style={styles.conversationSubtitle}>
                          {activeConversation.description ||
                            'Canal seguro para coordinacion, seguimiento y decisiones en tiempo real.'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.conversationHeaderActions}>
                      <Pressable
                        onPress={() => void handleStartCall('audio')}
                        disabled={!canStartRealtimeCall}
                        style={[
                          styles.conversationActionButton,
                          styles.conversationActionButtonAudio,
                          activeConversationCallMode === 'audio'
                            ? styles.conversationActionButtonAudioActive
                            : undefined,
                          !canStartRealtimeCall ? styles.conversationActionButtonDisabled : undefined,
                        ]}>
                        <MaterialCommunityIcons
                          name={activeConversationCallMode === 'audio' ? 'phone' : 'phone-outline'}
                          size={20}
                          color={!canStartRealtimeCall ? theme.colors.muted : '#FFFFFF'}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => void handleStartCall('video')}
                        disabled={!canStartRealtimeCall}
                        style={[
                          styles.conversationActionButton,
                          styles.conversationActionButtonVideo,
                          activeConversationCallMode === 'video'
                            ? styles.conversationActionButtonVideoActive
                            : undefined,
                          !canStartRealtimeCall ? styles.conversationActionButtonDisabled : undefined,
                        ]}>
                        <MaterialCommunityIcons
                          name={activeConversationCallMode === 'video' ? 'video' : 'video-outline'}
                          size={20}
                          color={!canStartRealtimeCall ? theme.colors.muted : '#FFFFFF'}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {!isMobileConversation ? (
                    <View style={styles.conversationHeaderFooter}>
                    <View style={styles.headerMetaPills}>
                      <StatusPill label={getConversationLabel(activeConversation)} tone="info" />
                      <StatusPill
                        label={activeConversation.encrypted ? 'Cifrado activo' : 'Canal abierto'}
                        tone={activeConversation.encrypted ? 'positive' : 'neutral'}
                      />
                      <StatusPill
                        label={
                          activeCallSession
                            ? `${Math.max(callParticipants.length, 1)} en cabina`
                            : 'Cabina lista'
                        }
                        tone={activeCallSession ? callTone : 'neutral'}
                      />
                      {activeCallSession ? (
                        <StatusPill label={formatDuration(callElapsedSeconds)} tone="neutral" />
                      ) : null}
                    </View>

                    <View style={styles.conversationHintRow}>
                      <MaterialCommunityIcons
                        name={activeCallSession ? 'radio-tower' : 'headset'}
                        size={16}
                        color={activeCallSession ? theme.colors.info : theme.colors.muted}
                      />
                      <Text style={styles.conversationHintText}>{conversationCallHint}</Text>
                    </View>
                  </View>
                  ) : null}
                </View>

                {activeCallSession ? (
                  <View style={styles.callHub}>
                    <View style={styles.callHubHeader}>
                      <View style={styles.callHubCopy}>
                        <Text style={styles.callHubTitle}>Cabina en vivo</Text>
                        <Text style={styles.callHubSubtitle}>
                          La llamada vive dentro del mismo chat y mantiene el contexto visible.
                        </Text>
                      </View>
                      <StatusPill label={callStatusLabel} tone={callTone} />
                    </View>

                    <View style={styles.callStage}>
                      <CallMediaTile
                        stream={activeCallSession.remoteStream}
                        label={leadRemoteParticipant?.name || activeConversation.title}
                        caption={
                          activeCallSession.phase === 'connected'
                            ? 'Conectado'
                            : 'Esperando respuesta'
                        }
                        mode={activeCallSession.mode}
                        muted={false}
                      />
                      <CallMediaTile
                        stream={localStreamRef.current}
                        label="Tu cabina"
                        caption={
                          isCallMuted
                            ? 'Microfono en silencio'
                            : activeCallSession.mode === 'video'
                              ? 'Camara lista'
                              : 'Audio listo'
                        }
                        mode={activeCallSession.mode}
                        muted
                        isSelf
                      />
                    </View>

                    <View style={styles.callControlRow}>
                      <Pressable
                        onPress={toggleCallMute}
                        style={[
                          styles.callControlButton,
                          isCallMuted ? styles.callControlButtonActive : undefined,
                        ]}>
                        <MaterialCommunityIcons
                          name={isCallMuted ? 'microphone-off' : 'microphone'}
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.callControlText}>
                          {isCallMuted ? 'Activar micro' : 'Silenciar'}
                        </Text>
                      </Pressable>

                      {activeCallSession.mode === 'video' ? (
                        <Pressable
                          onPress={toggleCamera}
                          style={[
                            styles.callControlButtonSecondary,
                            !isCameraEnabled ? styles.callControlButtonSecondaryActive : undefined,
                          ]}>
                          <MaterialCommunityIcons
                            name={isCameraEnabled ? 'video-outline' : 'video-off-outline'}
                            size={18}
                            color="#FFFFFF"
                          />
                          <Text style={styles.callControlText}>
                            {isCameraEnabled ? 'Pausar camara' : 'Encender camara'}
                          </Text>
                        </Pressable>
                      ) : null}

                      <Pressable
                        onPress={() =>
                          void closeActiveCall({
                            emitHangup: true,
                            reason: 'Llamada finalizada.',
                          })
                        }
                        style={styles.callControlButtonDanger}>
                        <MaterialCommunityIcons name="phone-hangup" size={18} color="#FFFFFF" />
                        <Text style={styles.callControlText}>Colgar</Text>
                      </Pressable>
                    </View>

                    <View style={styles.callMetaRow}>
                      <StatusPill label={`${Math.max(callParticipants.length, 1)} en cabina`} tone="info" />
                      <StatusPill label={formatDuration(callElapsedSeconds)} tone="neutral" />
                      {activeCallSession.mode === 'video' ? (
                        <StatusPill
                          label={isCameraEnabled ? 'Camara activa' : 'Camara pausada'}
                          tone={isCameraEnabled ? 'positive' : 'neutral'}
                        />
                      ) : null}
                    </View>

                    <Text style={styles.callHubNotice}>
                      {callNotice ||
                        'La otra persona puede tocar llamada o video desde este mismo chat para unirse.'}
                    </Text>
                  </View>
                ) : null}

                <ScrollView
                  style={styles.messagesScroll}
                  contentContainerStyle={styles.messagesList}
                  showsVerticalScrollIndicator={false}>

                  {activeMessages.length ? (
                    activeMessages.map((message) => {
                      const isOwn = message.senderId === user?.id;

                      return (
                        <View
                          key={message.id}
                          style={[
                            styles.messageRow,
                            isOwn ? styles.messageRowOwn : undefined,
                          ]}>
                          {!isOwn ? (
                            <UserAvatar
                              user={message.sender || activeContact}
                              status={message.sender?.status}
                              size={34}
                            />
                          ) : null}

                          <View
                            style={[
                              styles.messageBubble,
                              isOwn ? styles.messageBubbleOwn : undefined,
                              !isOwn ? styles.messageBubbleOther : undefined,
                              message.kind === 'audio' ? styles.messageBubbleAudio : undefined,
                              (message.kind === 'image' || message.kind === 'video') ? styles.messageBubbleMedia : undefined,
                            ]}>
                            <View style={styles.messageHeader}>
                              <Text
                                style={[
                                  styles.messageSender,
                                  isOwn ? styles.messageSenderOwn : undefined,
                                ]}>
                                {isOwn
                                  ? 'Tu'
                                  : message.sender?.name || activeConversation.title || 'Operacion'}
                              </Text>
                              <Text
                                style={[
                                  styles.messageMeta,
                                  isOwn ? styles.messageMetaOwn : undefined,
                                ]}>
                                {formatRelativeTime(message.createdAt)}
                              </Text>
                            </View>

                            {message.kind === 'audio' ? (
                              <VoiceMessageBubble isOwn={isOwn} message={message} token={token} />
                            ) : message.kind === 'image' ? (
                              <ImageMessageBubble message={message} token={token} />
                            ) : message.kind === 'video' ? (
                              <VideoMessageBubble message={message} token={token} />
                            ) : (
                              <Text
                                style={[
                                  styles.messageText,
                                  isOwn ? styles.messageTextOwn : undefined,
                                ]}>
                                {message.text}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyState}>
                      <MaterialCommunityIcons
                        name="message-text-outline"
                        size={28}
                        color={theme.colors.muted}
                      />
                      <Text style={styles.emptyTitle}>
                        Chat listo para conversar
                      </Text>
                      <Text style={styles.emptyText}>
                        Escribe el primer mensaje, adjunta un archivo o abre una llamada para empezar.
                      </Text>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.composerShell}>
                  {recorderMessage ? (
                    <View style={styles.recorderHint}>
                      <MaterialCommunityIcons
                        name={recordingState === 'recording' ? 'record-rec' : 'information-outline'}
                        size={16}
                        color={recordingState === 'recording' ? theme.colors.accent : theme.colors.info}
                      />
                      <Text style={styles.recorderHintText}>
                        {recordingState === 'recording'
                          ? `${recorderMessage} ${formatDuration(recordingSeconds)} / ${formatDuration(MAX_VOICE_NOTE_SECONDS)}`
                          : recorderMessage}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.composerBar}>
                    <Pressable
                      accessibilityLabel="Adjuntar imagen"
                      accessibilityRole="button"
                      onPress={() => void handlePickMedia('image')}
                      style={styles.mediaButton}>
                      <MaterialCommunityIcons name="image-outline" size={22} color={theme.colors.muted} />
                    </Pressable>

                    <View style={styles.composerInputShell}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder={
                        `Escribe a ${activeContact?.name || activeConversation.title}`
                      }
                      placeholderTextColor={theme.colors.muted}
                      style={styles.composerInput}
                      multiline
                    />
                  </View>

                      <Pressable
                        accessibilityLabel="Adjuntar video"
                        accessibilityRole="button"
                        onPress={() => void handlePickMedia('video')}
                        style={styles.mediaButton}>
                        <MaterialCommunityIcons name="video-outline" size={22} color={theme.colors.muted} />
                      </Pressable>

                    {draft.trim().length ? (
                      <PrimaryButton
                        label={isSubmitting ? '...' : 'Enviar'}
                        icon="send"
                        compact
                        loading={isSubmitting && recordingState !== 'uploading'}
                        disabled={!canSendText}
                        onPress={() => void handleSendText()}
                        style={styles.sendButton}
                      />
                    ) : (
                      <Pressable
                        accessibilityLabel={recordingState === 'recording' ? 'Detener audio' : 'Grabar audio'}
                        accessibilityRole="button"
                        onPress={() => void handleVoiceAction()}
                        disabled={!canRecord || isSubmitting}
                        style={[
                          styles.voiceButton,
                          recordingState === 'recording'
                            ? styles.voiceButtonRecording
                            : recordingState === 'uploading'
                              ? styles.voiceButtonLoading
                              : undefined,
                          (!canRecord || isSubmitting) ? styles.voiceButtonDisabled : undefined,
                        ]}>
                        {recordingState === 'uploading' ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <MaterialCommunityIcons
                            name={recordingState === 'recording' ? 'stop-circle-outline' : 'microphone'}
                            size={20}
                            color="#FFFFFF"
                          />
                        )}
                        <Text style={styles.voiceButtonText}>
                          {recordingState === 'recording'
                            ? 'Detener'
                            : 'Audio'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="forum-outline" size={28} color={theme.colors.muted} />
                <Text style={styles.emptyTitle}>Selecciona un canal</Text>
                <Text style={styles.emptyText}>
                  Abre un grupo o un chat directo para empezar a coordinar desde aqui.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </AppShell>
  );
}

function VoiceMessageBubble({
  isOwn,
  message,
  token,
}: {
  isOwn: boolean;
  message: ChatMessage;
  token: string | null;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const resolvedAudioUrl = resolveAssetUrl(message.audioUrl);
  const player = useAudioPlayer(
    resolvedAudioUrl
      ? {
          uri: resolvedAudioUrl,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      : null,
    {
      updateInterval: 250,
      keepAudioSessionActive: true,
    }
  );
  const playerStatus = useAudioPlayerStatus(player);

  const handlePlayback = async () => {
    if (!resolvedAudioUrl) {
      return;
    }

    if (playerStatus?.playing) {
      player.pause();
      return;
    }

    if (
      playerStatus?.isLoaded &&
      playerStatus.duration > 0 &&
      playerStatus.currentTime >= playerStatus.duration
    ) {
      await player.seekTo(0);
    }

    player.play();
  };

  return (
    <Pressable onPress={() => void handlePlayback()} style={styles.voiceMessageCard}>
      <View style={[styles.voicePlayButton, isOwn ? styles.voicePlayButtonOwn : undefined]}>
        {!playerStatus?.isLoaded || playerStatus?.isBuffering ? (
          <ActivityIndicator color={isOwn ? theme.colors.accent : '#FFFFFF'} />
        ) : (
          <MaterialCommunityIcons
            name={playerStatus.playing ? 'pause' : 'play'}
            size={18}
            color={isOwn ? theme.colors.accent : '#FFFFFF'}
          />
        )}
      </View>

      <View style={styles.voiceCopy}>
        <Text style={[styles.voiceTitle, isOwn ? styles.voiceTitleOwn : undefined]}>
          {message.transcript || message.text || 'Transmision de audio'}
        </Text>
        <Text style={[styles.voiceMeta, isOwn ? styles.voiceMetaOwn : undefined]}>
          {formatDuration(message.durationSeconds || 0)}
        </Text>
      </View>
    </Pressable>
  );
}

function ImageMessageBubble({ message, token }: { message: ChatMessage; token: string | null }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const resolvedUrl = resolveAssetUrl(message.audioUrl); // Reusing field
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);

  if (!resolvedUrl) return null;

  return (
    <View style={styles.mediaContainer}>
      <Pressable onPress={() => setIsFullscreen(true)}>
        <Image source={{ uri: resolvedUrl, headers }} style={styles.messageImage} resizeMode="cover" />
      </Pressable>
      {message.text ? <Text style={styles.mediaCaption}>{message.text}</Text> : null}

      <Modal visible={isFullscreen} transparent={true} onRequestClose={() => setIsFullscreen(false)}>
        <View style={styles.fullscreenOverlay}>
          <Pressable style={styles.closeFullscreen} onPress={() => setIsFullscreen(false)}>
            <MaterialCommunityIcons name="close" size={30} color="#FFFFFF" />
          </Pressable>
          <Image source={{ uri: resolvedUrl, headers }} style={styles.fullscreenImage} resizeMode="contain" />
        </View>
      </Modal>
    </View>
  );
}

function VideoMessageBubble({ message, token }: { message: ChatMessage; token: string | null }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const resolvedUrl = resolveAssetUrl(message.audioUrl);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);
  const player = useVideoPlayer(resolvedUrl ? { uri: resolvedUrl, headers } : null, (player) => {
    player.loop = false;
  });

  if (!resolvedUrl) return null;

  return (
    <View style={styles.mediaContainer}>
      <VideoView player={player} style={styles.messageVideo} allowsFullscreen allowsPictureInPicture />
      {message.text ? <Text style={styles.mediaCaption}>{message.text}</Text> : null}
    </View>
  );
}

function CallMediaTile({
  stream,
  label,
  caption,
  mode,
  muted,
  isSelf = false,
}: {
  stream: MediaStream | null;
  label: string;
  caption: string;
  mode: CallMode;
  muted: boolean;
  isSelf?: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasVideoTrack = Boolean(
    stream?.getVideoTracks?.().some((track) => track.readyState === 'live')
  );

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const showVideo = Platform.OS === 'web' && hasVideoTrack && mode === 'video';

  return (
    <View style={[styles.callTile, isSelf ? styles.callTileSelf : undefined]}>
      {Platform.OS === 'web'
        ? createElement('video', {
            autoPlay: true,
            playsInline: true,
            muted,
            ref: videoRef as any,
            style: showVideo
              ? {
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  backgroundColor: '#000000',
                }
              : styles.callTileHiddenMedia,
          })
        : null}

      {!showVideo ? (
        <View style={styles.callTileFallback}>
          <View style={[styles.callTileIconShell, isSelf ? styles.callTileIconShellSelf : undefined]}>
            <MaterialCommunityIcons
              name={mode === 'video' ? 'video-outline' : 'phone-outline'}
              size={28}
              color="#FFFFFF"
            />
          </View>
        </View>
      ) : null}

      <View style={styles.callTileFooter}>
        <Text style={styles.callTileLabel}>{label}</Text>
        <Text style={styles.callTileCaption}>{caption}</Text>
      </View>
    </View>
  );
}

function createStyles(
  theme: ReturnType<typeof useAppTheme>['theme'],
  isCompact: boolean,
  isPhone: boolean
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      minHeight: 0,
      gap: AppTheme.spacing.md,
      backgroundColor: theme.colors.background,
    },
    containerConversationOnly: {
      gap: 8,
      paddingBottom: 0,
    },
    header: {
      gap: 10,
      paddingTop: 4,
      minWidth: 0,
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 28 : 34,
      lineHeight: isPhone ? 34 : 40,
    },
    subtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 22,
      maxWidth: 780,
    },
    headerPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    mobileSwitch: {
      flexDirection: 'row',
      gap: 8,
    },
    mobileSwitchButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    mobileSwitchButtonActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    mobileSwitchLabel: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    mobileSwitchLabelActive: {
      color: '#FFFFFF',
    },
    layout: {
      flex: 1,
      minHeight: 0,
      flexDirection: isCompact ? 'column' : 'row',
      gap: AppTheme.spacing.md,
      alignItems: 'stretch',
    },
    directoryPanel: {
      flex: isCompact ? 1 : undefined,
      width: isCompact ? '100%' : 368,
      minWidth: 0,
      minHeight: 0,
      borderRadius: isPhone ? 20 : 24,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: isPhone ? 14 : 16,
      gap: 16,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 18px 36px rgba(4, 16, 27, 0.12)',
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 4,
          }),
    },
    conversationPanel: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      borderRadius: isPhone ? 20 : 24,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: isPhone ? 14 : 16,
      gap: 12,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 18px 36px rgba(4, 16, 27, 0.12)',
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 4,
          }),
    },
    conversationPanelMobile: {
      borderWidth: 0,
      borderRadius: 0,
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      gap: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F4EE' : '#0B1118',
      shadowOpacity: 0,
      elevation: 0,
    },
    searchShell: {
      minHeight: 56,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 14,
      paddingRight: 8,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
    },
    searchClearButton: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? '#EEF2F7' : 'rgba(159, 176, 202, 0.12)',
    },
    searchVoiceButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.colors.info,
      borderWidth: 1,
      borderColor: theme.colors.info,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchVoiceButtonActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    searchVoiceButtonLoading: {
      opacity: 0.9,
    },
    searchVoiceButtonDisabled: {
      opacity: 0.4,
    },
    searchMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: -4,
    },
    searchMetaText: {
      flex: 1,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    searchHintText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: -4,
    },
    modeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    modeChip: {
      minHeight: 44,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 14,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    modeChipActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    modeChipCopy: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modeChipText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    modeChipTextActive: {
      color: '#FFFFFF',
    },
    modeChipCount: {
      minWidth: 24,
      height: 24,
      paddingHorizontal: 8,
      borderRadius: 999,
      backgroundColor: theme.mode === 'light' ? '#E8ECF3' : 'rgba(159, 176, 202, 0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeChipCountActive: {
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    modeChipCountText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '800',
    },
    modeChipCountTextActive: {
      color: '#FFFFFF',
    },
    filterSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: -2,
    },
    filterSummaryText: {
      flex: 1,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    directoryScroll: {
      flex: 1,
      minHeight: 0,
    },
    directoryContent: {
      gap: 14,
      paddingBottom: 8,
    },
    sectionBlock: {
      gap: 12,
    },
    sectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 20,
      lineHeight: 26,
    },
    quickActionCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
    },
    quickActionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    quickActionTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '800',
    },
    quickActionBody: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 20,
    },
    conversationTile: {
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 2,
      paddingVertical: 12,
    },
    conversationTileActive: {
      borderBottomColor: theme.colors.accent,
      backgroundColor: theme.colors.surfaceAlt,
    },
    tileTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    tileLead: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      minWidth: 0,
    },
    tileCopy: {
      flex: 1,
      minWidth: 0,
      gap: 5,
    },
    tileTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 16,
      fontWeight: '900',
    },
    tileTime: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '700',
    },
    tileMeta: {
      flex: 1,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    tilePreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    tilePreview: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 21,
    },
    tileFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    },
    tileFooterText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '700',
    },
    tilePills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    groupAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadBubble: {
      minWidth: 26,
      height: 26,
      paddingHorizontal: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadBubbleText: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
    },
    contactRow: {
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 2,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    contactActions: {
      flexDirection: 'row',
      gap: 8,
    },
    contactActionButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyStateCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    emptyStateCopy: {
      flex: 1,
      gap: 4,
    },
    emptyStateTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
    },
    emptyStateBody: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    backButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    backButtonText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    headerBackButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -8,
    },
    conversationHeader: {
      gap: isPhone ? 6 : 12,
      paddingHorizontal: isPhone ? 8 : 0,
      paddingTop: isPhone ? 4 : 0,
      paddingBottom: isPhone ? 8 : 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
    },
    conversationHeaderTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: isPhone ? 8 : 14,
    },
    conversationHeaderMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    groupAvatarLarge: {
      width: isPhone ? 42 : 58,
      height: isPhone ? 42 : 58,
      borderRadius: isPhone ? 21 : 20,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    conversationCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    conversationTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 17 : 26,
      lineHeight: isPhone ? 22 : 32,
    },
    conversationSubtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: isPhone ? 12 : 14,
      lineHeight: isPhone ? 16 : 22,
      maxWidth: 780,
    },
    conversationHeaderActions: {
      flexDirection: 'row',
      gap: isPhone ? 6 : 10,
      alignSelf: 'center',
    },
    conversationActionButton: {
      width: isPhone ? 40 : 52,
      height: isPhone ? 40 : 52,
      borderRadius: isPhone ? 20 : 18,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    conversationActionButtonAudio: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accentSoft,
    },
    conversationActionButtonAudioActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    conversationActionButtonVideo: {
      backgroundColor: theme.colors.infoSoft,
      borderColor: theme.colors.infoSoft,
    },
    conversationActionButtonVideoActive: {
      backgroundColor: theme.colors.info,
      borderColor: theme.colors.info,
    },
    conversationActionButtonDisabled: {
      opacity: 0.45,
    },
    conversationHeaderFooter: {
      gap: 10,
    },
    headerMetaPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    conversationHintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    conversationHintText: {
      flex: 1,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    callHub: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: isPhone ? 14 : 16,
      gap: 12,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: `0px 16px 30px ${theme.colors.shadow}`,
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 6,
          }),
    },
    callHubHeader: {
      flexDirection: isPhone ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: isPhone ? 'flex-start' : 'center',
      gap: 12,
    },
    callHubCopy: {
      flex: 1,
      gap: 4,
    },
    callHubTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 20,
    },
    callHubSubtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 20,
    },
    callStarterGrid: {
      flexDirection: isPhone ? 'column' : 'row',
      gap: 12,
    },
    callStarterCard: {
      flex: 1,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      backgroundColor: theme.colors.accent,
      padding: 16,
      gap: 10,
    },
    callStarterCardVideo: {
      backgroundColor: theme.colors.info,
      borderColor: theme.colors.info,
    },
    callStarterCardDisabled: {
      opacity: 0.45,
    },
    callStarterTitle: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '800',
    },
    callStarterBody: {
      color: 'rgba(255,255,255,0.82)',
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 20,
    },
    callStage: {
      flexDirection: isPhone ? 'column' : 'row',
      gap: 10,
    },
    callTile: {
      flex: 1,
      minHeight: isPhone ? 180 : 196,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: '#0A0F17',
      justifyContent: 'flex-end',
    },
    callTileSelf: {
      backgroundColor: '#131B26',
    },
    callTileVideo: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: '#000000',
    },
    callTileHiddenMedia: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0.01,
    },
    callTileFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(11, 16, 27, 0.88)',
    },
    callTileIconShell: {
      width: 72,
      height: 72,
      borderRadius: 24,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    callTileIconShellSelf: {
      backgroundColor: theme.colors.info,
    },
    callTileFooter: {
      padding: 16,
      gap: 2,
      backgroundColor: 'rgba(8, 12, 19, 0.62)',
    },
    callTileLabel: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
    },
    callTileCaption: {
      color: 'rgba(255,255,255,0.72)',
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    callControlRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    callControlButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    callControlButtonActive: {
      backgroundColor: theme.colors.warning,
      borderColor: theme.colors.warning,
    },
    callControlButtonSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.info,
      borderWidth: 1,
      borderColor: theme.colors.info,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    callControlButtonSecondaryActive: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.line,
    },
    callControlButtonDanger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.danger,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    callControlText: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    callMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    callHubNotice: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    messagesScroll: {
      flex: 1,
      minHeight: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F4EE' : '#0B1118',
    },
    messagesList: {
      gap: 10,
      paddingHorizontal: isPhone ? 10 : 0,
      paddingTop: 12,
      paddingBottom: 14,
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
    },
    messageRowOwn: {
      justifyContent: 'flex-end',
    },
    messageBubble: {
      maxWidth: isPhone ? '86%' : '78%',
      minWidth: 0,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 13,
      paddingVertical: 9,
      gap: 6,
    },
    messageBubbleOwn: {
      backgroundColor: theme.colors.accent,
      borderBottomRightRadius: 6,
    },
    messageBubbleOther: {
      borderBottomLeftRadius: 6,
    },
    messageBubbleAudio: {
      minWidth: isPhone ? 0 : 260,
    },
    messageBubbleMedia: {
      paddingHorizontal: 7,
      paddingVertical: 7,
      width: isPhone ? '78%' : 280,
    },
    mediaContainer: {
      gap: 6,
    },
    messageImage: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 16,
    },
    messageVideo: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: 16,
    },
    mediaCaption: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      paddingHorizontal: 8,
      paddingBottom: 4,
    },
    fullscreenOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullscreenImage: {
      width: '100%',
      height: '100%',
    },
    closeFullscreen: {
      position: 'absolute',
      top: 40,
      right: 20,
      zIndex: 10,
    },
    messageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      minWidth: 0,
    },
    messageSender: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
      flexShrink: 1,
    },
    messageSenderOwn: {
      color: '#FFFFFF',
    },
    messageMeta: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '700',
      flexShrink: 0,
    },
    messageMetaOwn: {
      color: 'rgba(255,255,255,0.76)',
    },
    messageText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
      lineHeight: 22,
      flexShrink: 1,
    },
    messageTextOwn: {
      color: '#FFFFFF',
    },
    voiceMessageCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    voicePlayButton: {
      width: 42,
      height: 42,
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    voicePlayButtonOwn: {
      backgroundColor: '#FFFFFF',
    },
    voiceCopy: {
      flex: 1,
      gap: 2,
    },
    voiceTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '700',
    },
    voiceTitleOwn: {
      color: '#FFFFFF',
    },
    voiceMeta: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
    },
    voiceMetaOwn: {
      color: 'rgba(255,255,255,0.76)',
    },
    composerShell: {
      flexShrink: 0,
      gap: 8,
      paddingHorizontal: isPhone ? 8 : 0,
      paddingTop: 8,
      paddingBottom: isPhone ? 8 : 0,
      borderTopWidth: 1,
      borderTopColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
    },
    composerBar: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    composerInputShell: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      maxHeight: 104,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    composerInput: {
      minHeight: 30,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
      lineHeight: 22,
      textAlignVertical: 'top',
    },
    composerActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'center',
    },
    mediaActions: {
      flexDirection: 'row',
      gap: 4,
    },
    mediaButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    voiceButton: {
      minWidth: isPhone ? 42 : 118,
      minHeight: 42,
      borderRadius: 21,
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      paddingHorizontal: isPhone ? 0 : 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    sendButton: {
      minHeight: 42,
      borderRadius: 21,
      minWidth: isPhone ? 82 : 90,
    },
    voiceButtonRecording: {
      backgroundColor: theme.colors.danger,
      borderColor: theme.colors.danger,
    },
    voiceButtonLoading: {
      opacity: 0.88,
    },
    voiceButtonDisabled: {
      opacity: 0.45,
    },
    voiceButtonText: {
      color: '#FFFFFF',
      display: isPhone ? 'none' : 'flex',
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
    },
    recorderHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    recorderHintText: {
      flex: 1,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 32,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 20,
      textAlign: 'center',
    },
    emptyText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 320,
    },
  });
}
