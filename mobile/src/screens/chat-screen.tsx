import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import * as ImagePicker from '@/src/native/image-picker';
import { useVideoPlayer, VideoView } from '@/src/native/video';
import { io, type Socket } from 'socket.io-client';
import {
  RecordingPresets,
  getAudioPlaybackErrorMessage,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from '@/src/native/audio';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { resolveAssetUrl, transcribeVoiceSearchRequest, SOCKET_URL } from '@/src/api/client';
import { AppShell } from '@/src/components/app-shell';
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
import { getTextInputProps } from '@/src/utils/text-input-props';

type DirectoryMode = 'all' | 'priority' | 'unread';
type MobilePane = 'directory' | 'conversation';
type OperationalActionCategory = 'root' | 'drivers' | 'units' | 'groups';
type RecordingState = 'idle' | 'recording' | 'uploading';
type VoiceSearchState = 'idle' | 'recording' | 'processing';
type CallMode = 'audio' | 'video';
type CallPhase = 'waiting' | 'connecting' | 'connected';
type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
type LocalTextMessage = ChatMessage & {
  localStatus: 'sending' | 'failed';
  retryText: string;
};
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
type DirectoryListItem =
  | { type: 'generalShortcut'; id: string }
  | { type: 'conversation'; id: string; conversation: ConversationSummary }
  | { type: 'contact'; id: string; contact: ChatDirectoryContact }
  | { type: 'empty'; id: string };
type MessageListItem =
  | { type: 'date'; id: string; label: string }
  | { type: 'message'; id: string; message: ChatMessage };
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
  return conversation.kind === 'group' ? 'bullhorn-outline' : 'message-text-outline';
}

function getConversationDisplayTitle(conversation: ConversationSummary) {
  if (conversation.kind === 'group' && /general/i.test(conversation.title)) {
    return 'General Operativo';
  }

  return conversation.title;
}

function getConversationPresenceLabel(conversation: ConversationSummary, activeContact?: { status?: string } | null) {
  if (conversation.kind === 'direct' && activeContact?.status) {
    return formatStatus(activeContact.status);
  }

  return 'En linea';
}

function getConversationSubline(conversation: ConversationSummary, activeContact?: ChatDirectoryContact | null) {
  if (conversation.kind === 'group') {
    return `${conversation.participants.length || 1} integrantes`;
  }

  if (!activeContact) {
    return 'Chat directo';
  }

  const unitLabel =
    (activeContact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).unit ||
    (activeContact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).vehicle ||
    (activeContact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).vehicleName;

  return unitLabel || formatRole(activeContact.role);
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

function isPriorityConversation(conversation: ConversationSummary) {
  const text = `${conversation.title} ${conversation.description || ''} ${getConversationPreview(conversation)}`.toLowerCase();

  return (
    conversation.unreadCount > 0 ||
    text.includes('sos') ||
    text.includes('urgente') ||
    text.includes('retraso') ||
    text.includes('incidente') ||
    text.includes('alerta')
  );
}

function getOperationalStatusRank(status?: string | null) {
  const normalizedStatus = `${status || ''}`.toLowerCase();

  if (/available|disponible|online|linea|activo/.test(normalizedStatus)) return 0;
  if (/route|ruta|en camino|busy|ocupado/.test(normalizedStatus)) return 1;
  if (/transmit|transmitiendo|radio|ptt/.test(normalizedStatus)) return 2;
  if (/offline|desconect|inactive|inactivo/.test(normalizedStatus)) return 3;
  return 4;
}

function getOperationalStatusTone(status?: string | null) {
  const rank = getOperationalStatusRank(status);

  if (rank === 0) return 'positive';
  if (rank === 1) return 'warning';
  if (rank === 2) return 'danger';
  if (rank === 3) return 'neutral';
  return 'info';
}

function isSystemMessage(message: ChatMessage) {
  const body = `${message.text || ''} ${message.textPreview || ''}`.toLowerCase();
  return /ruta asignada|ruta finalizada|incidente|fuera de ruta|destino|gps perdido|conductor cambiado|cambio de estado/.test(body);
}

function getMessageDayKey(createdAt: string) {
  const date = new Date(createdAt);

  if (!Number.isFinite(date.getTime())) {
    return 'sin-fecha';
  }

  return date.toISOString().slice(0, 10);
}

function formatMessageDateLabel(createdAt: string) {
  const date = new Date(createdAt);

  if (!Number.isFinite(date.getTime())) {
    return 'Sin fecha';
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = getMessageDayKey(createdAt);

  if (key === getMessageDayKey(today.toISOString())) {
    return 'Hoy';
  }

  if (key === getMessageDayKey(yesterday.toISOString())) {
    return 'Ayer';
  }

  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
  });
}

function formatMessageTime(createdAt: string) {
  const date = new Date(createdAt);

  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildMessageList(messages: ChatMessage[]): MessageListItem[] {
  const items: MessageListItem[] = [];
  let lastDayKey: string | null = null;

  messages.forEach((message) => {
    const dayKey = getMessageDayKey(message.createdAt);

    if (dayKey !== lastDayKey) {
      items.push({
        type: 'date',
        id: `date-${dayKey}`,
        label: formatMessageDateLabel(message.createdAt),
      });
      lastDayKey = dayKey;
    }

    items.push({
      type: 'message',
      id: message.id,
      message,
    });
  });

  return items;
}

function getMessageDeliveryStatus(message: ChatMessage, isOwn: boolean): MessageDeliveryStatus | null {
  if (!isOwn) {
    return null;
  }

  const status = (message as ChatMessage & {
    status?: MessageDeliveryStatus;
    deliveryStatus?: MessageDeliveryStatus;
    sendStatus?: MessageDeliveryStatus;
  }).status || (message as ChatMessage & {
    deliveryStatus?: MessageDeliveryStatus;
  }).deliveryStatus || (message as ChatMessage & {
    sendStatus?: MessageDeliveryStatus;
  }).sendStatus || (message as ChatMessage & {
    localStatus?: MessageDeliveryStatus;
  }).localStatus;

  if (
    status === 'sending' ||
    status === 'sent' ||
    status === 'delivered' ||
    status === 'read' ||
    status === 'failed'
  ) {
    return status;
  }

  return 'sent';
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

  const messagesListRef = useRef<FlatList<MessageListItem> | null>(null);
  const isNearMessagesBottomRef = useRef(true);
  const shouldScrollAfterSendRef = useRef(false);
  const previousMessageCountRef = useRef(0);
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

  const activeConversation =
    chatConversations.find((conversation) => conversation.id === activeConversationId) ||
    chatConversations[0] ||
    null;
  const activeConversationKey = activeConversation?.id || null;
  const activeMessages = useMemo(
    () => (activeConversationKey ? messagesByConversation[activeConversationKey] || [] : []),
    [activeConversationKey, messagesByConversation]
  );
  const activePendingTextMessages = useMemo(
    () =>
      activeConversationKey
        ? pendingTextMessages.filter((message) => message.conversationId === activeConversationKey)
        : [],
    [activeConversationKey, pendingTextMessages]
  );
  const visibleMessages = useMemo(
    () => [...activeMessages, ...activePendingTextMessages],
    [activeMessages, activePendingTextMessages]
  );
  const activeContact = activeConversation ? getConversationContact(activeConversation, user?.id) : null;
  const searchTerm = search.trim().toLowerCase();
  const activeMessageItems = useMemo(() => buildMessageList(visibleMessages), [visibleMessages]);
  const conversationFilterCounts = useMemo(
    () => ({
      all: chatConversations.length,
      priority: chatConversations.filter(isPriorityConversation).length,
      unread: chatConversations.filter((conversation) => conversation.unreadCount > 0).length,
    }),
    [chatConversations]
  );
  const filteredConversations = useMemo(() => {
    const visibleConversations = chatConversations.filter((conversation) => {
      if (directoryMode === 'priority' && !isPriorityConversation(conversation)) {
        return false;
      }

      if (directoryMode === 'unread' && conversation.unreadCount === 0) {
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
    if (!searchTerm || directoryMode !== 'all') {
      return [];
    }

    return chatContacts.filter((contact) => getContactSearchText(contact).includes(searchTerm));
  }, [chatContacts, directoryMode, searchTerm]);
  const visibleConversations = filteredConversations;
  const visibleContacts = useMemo(() => {
    const visibleConversationIds = new Set(visibleConversations.map((conversation) => conversation.id));

    return filteredContacts.filter(
      (contact) => !contact.directConversationId || !visibleConversationIds.has(contact.directConversationId)
    );
  }, [filteredContacts, visibleConversations]);
  const visibleDirectoryCount = visibleConversations.length + visibleContacts.length;
  const hasGeneralConversation = filteredConversations.some(
    (conversation) => conversation.kind === 'group' && /general/i.test(conversation.title)
  );
  const showGeneralShortcut =
    !searchTerm && directoryMode !== 'unread' && !hasGeneralConversation;
  const visibleListCount = visibleDirectoryCount + (showGeneralShortcut ? 1 : 0);
  const directoryItems = useMemo<DirectoryListItem[]>(() => {
    const items: DirectoryListItem[] = [];

    if (showGeneralShortcut) {
      items.push({ type: 'generalShortcut', id: 'general-shortcut' });
    }

    visibleConversations.forEach((conversation) => {
      items.push({ type: 'conversation', id: `conversation-${conversation.id}`, conversation });
    });
    visibleContacts.forEach((contact) => {
      items.push({ type: 'contact', id: `contact-${contact.id}`, contact });
    });

    if (!items.length) {
      items.push({ type: 'empty', id: 'empty-directory' });
    }

    return items;
  }, [showGeneralShortcut, visibleContacts, visibleConversations]);
  const directoryHelperText = searchTerm
    ? `${visibleListCount} resultados para "${search.trim()}".`
    : directoryMode === 'priority'
      ? `${visibleListCount} conversaciones prioritarias.`
    : directoryMode === 'unread'
      ? `${visibleListCount} conversaciones no leidas.`
      : `${visibleListCount} conversaciones.`;
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
  const callTone =
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

  const scrollMessagesToEnd = (animated = true) => {
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToEnd({ animated });
    });
  };

  const handleMessagesScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isNearMessagesBottomRef.current = distanceFromBottom < 96;
  };

  const handleMessagesLayout = () => {
    if (isNearMessagesBottomRef.current || shouldScrollAfterSendRef.current) {
      scrollMessagesToEnd(false);
    }
  };

  const handleMessagesContentSizeChange = () => {
    if (isNearMessagesBottomRef.current || shouldScrollAfterSendRef.current) {
      scrollMessagesToEnd(true);
      shouldScrollAfterSendRef.current = false;
    }
  };

  useEffect(() => {
    isNearMessagesBottomRef.current = true;
    shouldScrollAfterSendRef.current = true;
    previousMessageCountRef.current = 0;
    scrollMessagesToEnd(false);
  }, [activeConversationKey]);

  useEffect(() => {
    const messageCount = activeMessageItems.filter((item) => item.type === 'message').length;
    const hasNewMessage = messageCount > previousMessageCountRef.current;

    if (hasNewMessage && (isNearMessagesBottomRef.current || shouldScrollAfterSendRef.current)) {
      scrollMessagesToEnd(true);
      shouldScrollAfterSendRef.current = false;
    }

    previousMessageCountRef.current = messageCount;
  }, [activeMessageItems]);

  useEffect(() => {
    const handleKeyboardChange = () => {
      if (isNearMessagesBottomRef.current || shouldScrollAfterSendRef.current) {
        setTimeout(() => scrollMessagesToEnd(true), 80);
      }
    };
    const showSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardChange);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardChange);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

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
      const pickerOptions = {
        mediaTypes: [type === 'image' ? 'images' as const : 'videos' as const],
        allowsEditing: true,
        quality: 0.8,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled) {
        setAttachmentNotice(null);
        return;
      }

      const asset = result.assets[0];

      if (!asset?.uri) {
        setAttachmentNotice('No se pudo leer el archivo seleccionado.');
        return;
      }

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

      const resultMessage = await sendMediaMessage(activeConversation.id, formData);

      if (resultMessage.ok) {
        setDraft('');
        setAttachmentNotice(type === 'image' ? 'Imagen enviada.' : 'Video enviado.');
        return;
      }

      setAttachmentNotice(resultMessage.message || 'Archivo listo, pero no se pudo enviar.');
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
          <View style={styles.headerTitleRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Mensajeria operativa</Text>
              <View style={styles.headerStatusRow}>
                <View style={styles.liveDot} />
                <Text style={styles.headerStatusText}>Conectado</Text>
                <MaterialCommunityIcons name="lock-outline" size={15} color={theme.colors.success} />
                <Text style={styles.headerSecureText}>Cifrado activo</Text>
              </View>
            </View>
            <Pressable
              onPress={() => {
                setAttachmentMenuOpen(true);
                setActionCategory('root');
              }}
              style={styles.headerActionButton}
              accessibilityLabel="Nueva accion operativa">
              <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
        )
      }>
      <View style={styles.layout}>
        {showDirectoryPanel ? (
          <View style={styles.directoryPanel}>
            <View style={styles.searchShell}>
              <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.muted} />
              <TextInput
                {...getTextInputProps(theme, { autoComplete: 'off', returnKeyType: 'search' })}
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar conversacion o unidad..."
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
                onPress={() => { handleVoiceSearchAction(); }}
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
            ) : null}

            <ScrollView
              horizontal
              style={styles.modeRowScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modeRow}>
              {[
                {
                  key: 'all',
                  label: 'Todo',
                  icon: 'chat-outline',
                  count: conversationFilterCounts.all,
                },
                {
                  key: 'priority',
                  label: 'Prioridad',
                  icon: 'alert-circle-outline',
                  count: conversationFilterCounts.priority,
                },
                {
                  key: 'unread',
                  label: 'No leidos',
                  icon: 'bell-outline',
                  count: conversationFilterCounts.unread,
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
            </ScrollView>

            <FlatList
              style={styles.directoryScroll}
              contentContainerStyle={styles.directoryContent}
              data={directoryItems}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Conversaciones</Text>
                  <Text style={styles.sectionHint}>{directoryHelperText}</Text>
                </View>
              }
              renderItem={({ item }) => {
                if (item.type === 'generalShortcut') {
                  return (
                    <Pressable
                      onPress={() => { handleOpenGeneral('chat'); }}
                      style={styles.quickActionCard}>
                      <View style={styles.groupAvatar}>
                        <MaterialCommunityIcons
                          name="bullhorn-outline"
                          size={20}
                          color={theme.colors.info}
                        />
                      </View>
                      <View style={styles.quickActionCopy}>
                        <Text style={styles.quickActionTitle}>General Operativo</Text>
                        <Text style={styles.quickActionBody} numberOfLines={1}>
                          Abrir grupo operativo
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={theme.colors.muted}
                      />
                    </Pressable>
                  );
                }

                if (item.type === 'conversation') {
                  const { conversation } = item;
                  const contact = getConversationContact(conversation, user?.id);
                  const isActive = conversation.id === activeConversation?.id;
                  const preview = getConversationPreview(conversation);

                  return (
                    <Pressable
                      onPress={() => {
                        handleSelectConversation(conversation.id);
                      }}
                      style={[
                        styles.conversationTile,
                        isActive ? styles.conversationTileActive : undefined,
                      ]}>
                      <View style={styles.tileLead}>
                        {conversation.kind === 'direct' && contact ? (
                          <UserAvatar user={contact} status={contact.status} showStatus size={42} />
                        ) : (
                          <View style={styles.groupAvatar}>
                            <MaterialCommunityIcons
                              name={getConversationIconName(conversation)}
                              size={18}
                              color={theme.colors.info}
                            />
                          </View>
                        )}
                        <View style={styles.tileCopy}>
                          <View style={styles.tileTitleRow}>
                            <Text style={styles.tileTitle} numberOfLines={1}>
                              {getConversationDisplayTitle(conversation)}
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
                          <View style={styles.tileStatusRow}>
                            <View
                              style={[
                                styles.tileStatusDot,
                                getOperationalStatusRank(contact?.status || 'online') === 3
                                  ? styles.tileStatusDotMuted
                                  : undefined,
                              ]}
                            />
                            <Text style={styles.tileStatusText} numberOfLines={1}>
                              {conversation.kind === 'group'
                                ? 'Canal operativo'
                                : getConversationPresenceLabel(conversation, contact)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                }

                if (item.type === 'contact') {
                  const { contact } = item;

                  return (
                    <View style={styles.contactRow}>
                      <View style={styles.tileLead}>
                        <UserAvatar user={contact} status={contact.status} showStatus size={42} />
                        <View style={styles.tileCopy}>
                          <Text style={styles.tileTitle} numberOfLines={1}>
                            {contact.name}
                          </Text>
                          <Text style={styles.tileMeta} numberOfLines={1}>
                            {formatRole(contact.role)} | {formatStatus(contact.status)}
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => { handleOpenDirect(contact.id, 'chat'); }}
                        style={styles.contactActionButton}>
                        <MaterialCommunityIcons
                          name="message-text-outline"
                          size={18}
                          color={theme.colors.text}
                        />
                      </Pressable>
                    </View>
                  );
                }

                return (
                  <View style={styles.emptyStateCard}>
                    <MaterialCommunityIcons
                      name="message-badge-outline"
                      size={20}
                      color={theme.colors.muted}
                    />
                    <View style={styles.emptyStateCopy}>
                      <Text style={styles.emptyStateTitle}>Sin conversaciones</Text>
                      <Text style={styles.emptyStateBody}>
                        Ajusta la busqueda o cambia el filtro.
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        ) : null}

        {showConversationPanel ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={isPhone ? 8 : 0}
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
                          size={isPhone ? 36 : 40}
                        />
                      ) : (
                        <View style={styles.groupAvatarLarge}>
                          <MaterialCommunityIcons
                            name="account-group-outline"
                            size={isPhone ? 19 : 22}
                            color={theme.colors.info}
                          />
                        </View>
                      )}

                      <View style={styles.conversationCopy}>
                        <Text style={styles.conversationTitle} numberOfLines={1}>
                          {getConversationDisplayTitle(activeConversation)}
                        </Text>
                        <Text style={styles.conversationSubtitle} numberOfLines={1}>
                          {getConversationSubline(activeConversation, activeContact)}  |  {getConversationPresenceLabel(activeConversation, activeContact)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.conversationHeaderActions}>
                      {canStartRealtimeCall ? (
                        <>
                          <Pressable
                            onPress={() => { handleStartCall('audio'); }}
                            style={[
                              styles.conversationActionButton,
                              activeConversationCallMode === 'audio'
                                ? styles.conversationActionButtonActive
                                : undefined,
                            ]}
                            accessibilityLabel="Iniciar llamada de voz">
                            <MaterialCommunityIcons
                              name={activeConversationCallMode === 'audio' ? 'phone' : 'phone-outline'}
                              size={20}
                              color={theme.colors.text}
                            />
                          </Pressable>
                          <Pressable
                            onPress={() => { handleStartCall('video'); }}
                            style={[
                              styles.conversationActionButton,
                              activeConversationCallMode === 'video'
                                ? styles.conversationActionButtonActive
                                : undefined,
                            ]}
                            accessibilityLabel="Iniciar videollamada">
                            <MaterialCommunityIcons
                              name={activeConversationCallMode === 'video' ? 'video' : 'video-outline'}
                              size={20}
                              color={theme.colors.text}
                            />
                          </Pressable>
                        </>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          handleOpenRadioFromChat();
                        }}
                        style={styles.conversationActionButton}
                        accessibilityLabel="Hablar por radio">
                        <MaterialCommunityIcons name="radio-handheld" size={20} color={theme.colors.text} />
                      </Pressable>
                      <Pressable
                        onPress={() => setOptionsMenuOpen(true)}
                        style={styles.conversationActionButton}
                        accessibilityLabel="Mas opciones">
                        <MaterialCommunityIcons name="dots-vertical" size={21} color={theme.colors.text} />
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.headerMetaPills}>
                    {activeStatusChips.map((chip) => (
                      <View key={chip.label} style={styles.headerMetaPill}>
                        <MaterialCommunityIcons
                          name={chip.icon as any}
                          size={12}
                          color={
                            chip.tone === 'positive'
                              ? theme.colors.success
                              : chip.tone === 'warning'
                                ? theme.colors.warning
                                : chip.tone === 'danger'
                                  ? theme.colors.danger
                                  : theme.colors.muted
                          }
                        />
                        <Text style={styles.headerMetaPillText}>{chip.label}</Text>
                      </View>
                    ))}
                  </View>
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
                          closeActiveCall({
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

                <FlatList
                  ref={messagesListRef}
                  style={styles.messagesScroll}
                  contentContainerStyle={styles.messagesList}
                  data={activeMessageItems}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={handleMessagesContentSizeChange}
                  onLayout={handleMessagesLayout}
                  onScroll={handleMessagesScroll}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    if (item.type === 'date') {
                      return (
                        <View style={styles.dateSeparator}>
                          <Text style={styles.dateSeparatorText}>{item.label}</Text>
                        </View>
                      );
                    }

                    const { message } = item;
                    const isOwn = message.senderId === user?.id;
                    const deliveryStatus = getMessageDeliveryStatus(message, isOwn);
                    const isSystem = isSystemMessage(message);
                    const localTextMessage = message as LocalTextMessage;
                    const canRetryMessage =
                      localTextMessage.localStatus === 'failed' && Boolean(localTextMessage.retryText);

                      return (
                        <View
                          key={message.id}
                          style={[
                            styles.messageRow,
                            isOwn ? styles.messageRowOwn : undefined,
                            isSystem ? styles.messageRowSystem : undefined,
                          ]}>
                          {!isOwn && !isSystem ? (
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
                              isSystem ? styles.systemMessageBubble : undefined,
                              message.kind === 'audio' ? styles.messageBubbleAudio : undefined,
                              (message.kind === 'image' || message.kind === 'video') ? styles.messageBubbleMedia : undefined,
                            ]}>
                            <View style={styles.messageHeader}>
                              {isSystem ? (
                                <MaterialCommunityIcons
                                  name="clipboard-pulse-outline"
                                  size={15}
                                  color={theme.colors.warning}
                                />
                              ) : null}
                              <Text
                                style={[
                                  styles.messageSender,
                                  isSystem ? styles.systemMessageSender : undefined,
                                  isOwn && !isSystem ? styles.messageSenderOwn : undefined,
                                ]}>
                                {isSystem
                                  ? 'Evento operativo'
                                  : isOwn
                                    ? 'Tu'
                                    : message.sender?.name || activeConversation.title || 'Operacion'}
                              </Text>
                              <Text
                                style={[
                                  styles.messageMeta,
                                  isOwn && !isSystem ? styles.messageMetaOwn : undefined,
                                ]}>
                                {formatMessageTime(message.createdAt)}
                              </Text>
                            </View>

                            {message.kind === 'audio' ? (
                              <VoiceMessageBubble
                                isActive={activeAudioMessageId === message.id}
                                isOwn={isOwn}
                                message={message}
                                onActivate={setActiveAudioMessageId}
                                onDeactivate={() => {
                                  setActiveAudioMessageId((current) =>
                                    current === message.id ? null : current
                                  );
                                }}
                                token={token}
                              />
                            ) : message.kind === 'image' ? (
                              <ImageMessageBubble message={message} token={token} />
                            ) : message.kind === 'video' ? (
                              <VideoMessageBubble message={message} token={token} />
                            ) : (
                              <Text
                                style={[
                                   styles.messageText,
                                   isOwn && !isSystem ? styles.messageTextOwn : undefined,
                                 ]}>
                                {message.text}
                              </Text>
                            )}

                            {deliveryStatus && !isSystem ? (
                              <MessageDeliveryMeta
                                status={deliveryStatus}
                                isOwn={isOwn}
                                time={formatMessageTime(message.createdAt)}
                              />
                            ) : null}

                            {canRetryMessage ? (
                              <Pressable
                                onPress={() => { handleRetryTextMessage(localTextMessage); }}
                                style={styles.retryMessageButton}
                                accessibilityRole="button"
                                accessibilityLabel="Reintentar mensaje">
                                <MaterialCommunityIcons
                                  name="refresh"
                                  size={14}
                                  color={isOwn ? '#FFFFFF' : theme.colors.danger}
                                />
                                <Text
                                  style={[
                                    styles.retryMessageText,
                                    isOwn ? styles.retryMessageTextOwn : undefined,
                                  ]}>
                                  Reintentar
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      );
                  }}
                  ListEmptyComponent={
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
                  }
                />

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

                  {attachmentNotice ? (
                    <View style={styles.recorderHint}>
                      <MaterialCommunityIcons
                        name="paperclip"
                        size={16}
                        color={theme.colors.info}
                      />
                      <Text style={styles.recorderHintText}>{attachmentNotice}</Text>
                    </View>
                  ) : null}

                  <View style={styles.composerBar}>
                    <Pressable
                      accessibilityLabel="Abrir adjuntos"
                      accessibilityRole="button"
                      onPress={() => {
                        setActionCategory('root');
                        setAttachmentMenuOpen(true);
                      }}
                      style={styles.attachButton}>
                      <MaterialCommunityIcons name="plus" size={24} color={theme.colors.text} />
                    </Pressable>

                    <View style={styles.composerInputShell}>
                      <TextInput
                        {...getTextInputProps(theme, { autoComplete: 'off', returnKeyType: 'send' })}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder={composerPlaceholder}
                        placeholderTextColor={theme.colors.muted}
                        style={styles.composerInput}
                        onFocus={() => {
                          if (isNearMessagesBottomRef.current) {
                            setTimeout(() => scrollMessagesToEnd(true), 80);
                          }
                        }}
                        multiline
                      />
                    </View>

                    {draft.trim().length ? (
                      <Pressable
                        accessibilityLabel="Enviar mensaje"
                        accessibilityRole="button"
                        onPress={() => { handleSendText(); }}
                        disabled={!canSendText}
                        style={[styles.sendIconButton, !canSendText ? styles.voiceButtonDisabled : undefined]}>
                        {isSubmitting && recordingState !== 'uploading' ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
                        )}
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityLabel={recordingState === 'recording' ? 'Detener audio' : 'Grabar audio'}
                        accessibilityRole="button"
                        onPress={() => { handleVoiceAction(); }}
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
          </KeyboardAvoidingView>
        ) : null}
      </View>

      <Modal
        visible={attachmentMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachmentMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setAttachmentMenuOpen(false)}>
          <Pressable style={styles.bottomSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              {actionCategory !== 'root' ? (
                <Pressable
                  onPress={() => setActionCategory('root')}
                  style={styles.sheetBackButton}
                  accessibilityLabel="Volver a acciones">
                  <MaterialCommunityIcons name="arrow-left" size={18} color={theme.colors.text} />
                </Pressable>
              ) : null}
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>
                  {actionCategory === 'drivers'
                    ? 'Conductores'
                    : actionCategory === 'units'
                      ? 'Unidades'
                      : actionCategory === 'groups'
                        ? 'Grupos'
                        : 'Nueva accion'}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  {actionCategory === 'drivers'
                    ? 'Inicia un chat directo ordenado por disponibilidad.'
                    : actionCategory === 'root'
                      ? 'Acciones rapidas para coordinar la operacion.'
                      : 'Accion operativa preparada para integrarse al flujo actual.'}
                </Text>
              </View>
            </View>

            {actionCategory === 'drivers' ? (
              <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
                {sortedOperationalContacts.map((contact) => {
                  const unitLabel =
                    (contact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).unit ||
                    (contact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).vehicle ||
                    (contact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).vehicleName ||
                    formatRole(contact.role);
                  const statusTone = getOperationalStatusTone(contact.status);

                  return (
                    <Pressable
                      key={contact.id}
                      style={styles.driverActionRow}
                      onPress={() => {
                        setAttachmentMenuOpen(false);
                        handleOpenDirect(contact.id, 'chat');
                      }}>
                      <UserAvatar user={contact} status={contact.status} showStatus size={42} />
                      <View style={styles.driverActionCopy}>
                        <Text style={styles.driverActionName} numberOfLines={1}>
                          {contact.name}
                        </Text>
                        <Text style={styles.driverActionUnit} numberOfLines={1}>
                          {unitLabel}
                        </Text>
                      </View>
                      <View style={styles.driverStatusPill}>
                        <View
                          style={[
                            styles.driverStatusDot,
                            statusTone === 'warning' ? styles.driverStatusDotWarning : undefined,
                            statusTone === 'danger' ? styles.driverStatusDotDanger : undefined,
                            statusTone === 'neutral' ? styles.driverStatusDotMuted : undefined,
                          ]}
                        />
                        <Text style={styles.driverStatusText}>{formatStatus(contact.status)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : actionCategory === 'units' || actionCategory === 'groups' ? (
              <View style={styles.sheetEmptyState}>
                <MaterialCommunityIcons
                  name={actionCategory === 'units' ? 'bus-clock' : 'account-group-outline'}
                  size={28}
                  color={theme.colors.muted}
                />
                <Text style={styles.sheetEmptyTitle}>
                  {actionCategory === 'units' ? 'Unidades en preparacion' : 'Grupos en preparacion'}
                </Text>
                <Text style={styles.sheetEmptyText}>
                  Esta accion queda lista en la experiencia sin cambiar contratos ni crear datos nuevos.
                </Text>
              </View>
            ) : (
              <View style={styles.sheetActionList}>
                {[
                  { label: 'Conductores', icon: 'account-hard-hat-outline', action: () => setActionCategory('drivers') },
                  { label: 'Unidades', icon: 'bus', action: () => setActionCategory('units') },
                  { label: 'Grupos', icon: 'account-group-outline', action: () => setActionCategory('groups') },
                  { label: 'Canal Operativo', icon: 'bullhorn-outline', action: () => { setAttachmentMenuOpen(false); handleOpenGeneral('chat'); } },
                  { label: 'Reportar incidencia', icon: 'alert-outline', action: () => { handleAttachmentUnavailable('Incidencia'); setAttachmentMenuOpen(false); } },
                  { label: 'Compartir ubicacion', icon: 'map-marker-outline', action: () => { handleAttachmentUnavailable('Ubicacion'); setAttachmentMenuOpen(false); } },
                  { label: 'Compartir documento', icon: 'file-document-outline', action: () => { handleAttachmentUnavailable('Documento'); setAttachmentMenuOpen(false); } },
                  { label: 'Compartir imagen', icon: 'image-outline', action: () => { handlePickMedia('image', 'library'); } },
                ].map((action) => (
                  <Pressable key={action.label} style={styles.sheetActionRow} onPress={action.action}>
                    <View style={styles.sheetActionIcon}>
                      <MaterialCommunityIcons name={action.icon as any} size={22} color={theme.colors.text} />
                    </View>
                    <Text style={styles.sheetActionText}>{action.label}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
                  </Pressable>
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={optionsMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOptionsMenuOpen(false)}>
          <Pressable style={styles.optionsSheet} onPress={(event) => event.stopPropagation()}>
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setOptionsMenuOpen(false);
                handleStartCall('audio');
              }}>
              <MaterialCommunityIcons name="phone-outline" size={22} color={theme.colors.text} />
              <Text style={styles.optionRowText}>Llamada de voz</Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setOptionsMenuOpen(false);
                handleStartCall('video');
              }}>
              <MaterialCommunityIcons name="video-outline" size={22} color={theme.colors.text} />
              <Text style={styles.optionRowText}>Videollamada</Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setOptionsMenuOpen(false);
                setCallNotice(
                  Platform.OS === 'web'
                    ? 'Crear reunion esta en preparacion.'
                    : 'Crear reunion esta en preparacion. En Android requiere WebRTC nativo.'
                );
              }}>
              <MaterialCommunityIcons name="account-group-outline" size={22} color={theme.colors.text} />
              <Text style={styles.optionRowText}>Crear reunion</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </AppShell>
  );
}

function MessageDeliveryMeta({
  status,
  isOwn,
  time,
}: {
  status: MessageDeliveryStatus;
  isOwn: boolean;
  time?: string;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const config = {
    sending: {
      icon: 'clock-outline',
      label: 'Enviando',
      color: isOwn ? 'rgba(255,255,255,0.76)' : theme.colors.muted,
    },
    sent: {
      icon: 'check',
      label: 'Enviado',
      color: isOwn ? 'rgba(255,255,255,0.76)' : theme.colors.muted,
    },
    delivered: {
      icon: 'check-all',
      label: 'Entregado',
      color: isOwn ? 'rgba(255,255,255,0.76)' : theme.colors.muted,
    },
    read: {
      icon: 'check-all',
      label: 'Leido',
      color: theme.colors.info,
    },
    failed: {
      icon: 'alert-circle-outline',
      label: 'No enviado',
      color: theme.colors.danger,
    },
  }[status];

  return (
    <View style={styles.deliveryMeta}>
      {time ? <Text style={[styles.deliveryMetaText, { color: config.color }]}>{time}</Text> : null}
      <MaterialCommunityIcons name={config.icon as any} size={14} color={config.color} />
      <Text style={[styles.deliveryMetaText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function VoiceMessageBubble({
  isActive,
  isOwn,
  message,
  onActivate,
  onDeactivate,
  token,
}: {
  isActive: boolean;
  isOwn: boolean;
  message: ChatMessage;
  onActivate: (messageId: string) => void;
  onDeactivate: () => void;
  token: string | null;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
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
  const currentSeconds = Math.max(0, Number(playerStatus.currentTime || 0));
  const durationSeconds = Math.max(
    0,
    Number(playerStatus.duration || message.durationSeconds || 0)
  );
  const progressRatio =
    durationSeconds > 0 ? Math.min(1, currentSeconds / durationSeconds) : 0;
  const isLoading = Boolean(playerStatus.isBuffering);
  const isPlaying = Boolean(playerStatus.playing);
  const hasStarted = playerStatus.isLoaded || currentSeconds > 0;
  const stateLabel = playbackError
    ? 'Error de audio'
    : isLoading
      ? 'Cargando'
      : isPlaying
        ? 'Reproduciendo'
        : hasStarted
          ? 'Pausado'
          : 'Listo';

  useEffect(() => {
    if (!isActive && playerStatus.playing) {
      player.pause().catch(() => undefined);
    }
  }, [isActive, player, playerStatus.playing]);

  useEffect(() => {
    if (
      isActive &&
      playerStatus.isLoaded &&
      !playerStatus.playing &&
      durationSeconds > 0 &&
      currentSeconds >= durationSeconds - 0.25
    ) {
      player.seekTo(0).catch(() => undefined);
      onDeactivate();
    }
  }, [
    currentSeconds,
    durationSeconds,
    isActive,
    onDeactivate,
    player,
    playerStatus.isLoaded,
    playerStatus.playing,
  ]);

  const handlePlayback = async () => {
    setPlaybackError(null);

    if (!resolvedAudioUrl) {
      setPlaybackError('URL de audio invalida.');
      return;
    }

    try {
      if (playerStatus?.playing) {
        await player.pause();
        return;
      }

      onActivate(message.id);

      if (
        playerStatus?.isLoaded &&
        playerStatus.duration > 0 &&
        playerStatus.currentTime >= playerStatus.duration
      ) {
        await player.seekTo(0);
      }

      await player.play();
    } catch (error) {
      setPlaybackError(getAudioPlaybackErrorMessage(error));
      onDeactivate();
    }
  };

  return (
    <Pressable onPress={() => { handlePlayback(); }} style={styles.voiceMessageCard}>
      <View style={[styles.voicePlayButton, isOwn ? styles.voicePlayButtonOwn : undefined]}>
        {isLoading ? (
          <ActivityIndicator color={isOwn ? theme.colors.accent : '#FFFFFF'} />
        ) : (
          <MaterialCommunityIcons
            name={isPlaying ? 'pause' : 'play'}
            size={18}
            color={isOwn ? theme.colors.accent : '#FFFFFF'}
          />
        )}
      </View>

      <View style={styles.voiceCopy}>
        <View style={[styles.voiceProgressTrack, isOwn ? styles.voiceProgressTrackOwn : undefined]}>
          <View
            style={[
              styles.voiceProgressFill,
              isOwn ? styles.voiceProgressFillOwn : undefined,
              { width: `${Math.round(progressRatio * 100)}%` },
            ]}
          />
        </View>
        <View style={styles.voiceMetaRow}>
          <Text style={[styles.voiceMeta, isOwn ? styles.voiceMetaOwn : undefined]}>
            {formatDuration(currentSeconds)} / {formatDuration(durationSeconds || message.durationSeconds || 0)}
          </Text>
          <Text style={[styles.voiceStateText, isOwn ? styles.voiceMetaOwn : undefined]}>
            {stateLabel}
          </Text>
        </View>
        {message.transcript || message.text ? (
          <Text
            style={[styles.voiceTitle, isOwn ? styles.voiceTitleOwn : undefined]}
            numberOfLines={2}>
            {message.transcript || message.text}
          </Text>
        ) : null}
        {playbackError ? (
          <Text style={[styles.voiceErrorInline, isOwn ? styles.voiceMetaOwn : undefined]}>
            {playbackError}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ImageMessageBubble({ message, token }: { message: ChatMessage; token: string | null }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const resolvedUrl = resolveAssetUrl(message.audioUrl); // Reusing field
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);

  if (!resolvedUrl) return null;

  return (
    <View style={styles.mediaContainer}>
      <Pressable
        disabled={hasError}
        onPress={() => setIsFullscreen(true)}
        style={styles.mediaPreviewShell}>
        <Image
          source={{ uri: resolvedUrl, headers }}
          style={styles.messageImage}
          resizeMode="cover"
          onError={() => {
            setHasError(true);
            setIsLoading(false);
          }}
          onLoad={() => {
            setHasError(false);
            setIsLoading(false);
          }}
          onLoadStart={() => {
            setIsLoading(true);
            setHasError(false);
          }}
        />
        {isLoading ? (
          <View style={styles.mediaLoadingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.mediaStateText}>Cargando imagen...</Text>
          </View>
        ) : null}
        {hasError ? (
          <View style={styles.mediaErrorBox}>
            <MaterialCommunityIcons name="image-off-outline" size={24} color={theme.colors.warning} />
            <Text style={[styles.mediaStateText, { color: theme.colors.warning }]}>
              No se pudo cargar la imagen.
            </Text>
          </View>
        ) : null}
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
  const player = useVideoPlayer(resolvedUrl ? { uri: resolvedUrl, headers } : null, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  if (!resolvedUrl) return null;

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.mediaContainer}>
        <View style={styles.videoUnavailableBox}>
          <MaterialCommunityIcons name="video-off-outline" size={26} color={theme.colors.muted} />
          <Text style={styles.videoUnavailableTitle}>Video proximamente</Text>
          <Text style={styles.videoUnavailableText}>
            Reproduccion de video no disponible todavia en Android.
          </Text>
        </View>
        {message.text ? <Text style={styles.mediaCaption}>{message.text}</Text> : null}
      </View>
    );
  }

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
      gap: 6,
      paddingTop: 4,
      minWidth: 0,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 26 : 32,
      lineHeight: isPhone ? 31 : 38,
    },
    headerStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    liveDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.success,
    },
    headerStatusText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '700',
    },
    headerSecureText: {
      color: theme.colors.success,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    headerActionButton: {
      width: 52,
      height: 52,
      borderRadius: 18,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 14px 26px rgba(229, 30, 45, 0.28)',
          }
        : {
            shadowColor: theme.colors.accent,
            shadowOpacity: 0.28,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }),
    },
    headerPills: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 8,
      paddingRight: 4,
    },
    categoryTabs: {
      flexDirection: 'row',
      gap: 8,
      paddingRight: 4,
    },
    categoryTabsScroll: {
      flexGrow: 0,
      flexShrink: 0,
      maxHeight: 40,
    },
    categoryTab: {
      minHeight: 38,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 13,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    categoryTabActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    categoryTabText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '900',
    },
    categoryTabTextActive: {
      color: '#FFFFFF',
    },
    categoryTabCount: {
      minWidth: 22,
      height: 22,
      borderRadius: 999,
      paddingHorizontal: 7,
      backgroundColor: theme.mode === 'light' ? '#E8ECF3' : 'rgba(159, 176, 202, 0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryTabCountActive: {
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    categoryTabCountText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 10,
      fontWeight: '900',
    },
    categoryTabCountTextActive: {
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
      borderRadius: isPhone ? 0 : 18,
      borderWidth: isPhone ? 0 : 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: isPhone ? 0 : 12,
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
    conversationPanel: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      borderRadius: isPhone ? 20 : 24,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: isPhone ? 14 : 16,
      gap: 8,
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
      minHeight: 44,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 12,
      paddingRight: 6,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      paddingVertical: 0,
    },
    searchClearButton: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? '#EEF2F7' : 'rgba(159, 176, 202, 0.12)',
    },
    searchVoiceButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
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
      marginTop: -2,
    },
    searchMetaText: {
      flex: 1,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      lineHeight: 16,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingRight: 4,
    },
    modeRowScroll: {
      flexGrow: 0,
      flexShrink: 0,
      maxHeight: 36,
    },
    modeChip: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
      fontSize: 12,
      fontWeight: '800',
    },
    modeChipTextActive: {
      color: '#FFFFFF',
    },
    modeChipCount: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 7,
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
      fontSize: 10,
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
      fontSize: 11,
      lineHeight: 16,
    },
    directoryScroll: {
      flex: 1,
      minHeight: 0,
    },
    directoryContent: {
      gap: 8,
      paddingBottom: 4,
    },
    sectionBlock: {
      gap: 8,
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
      fontSize: 16,
      lineHeight: 22,
    },
    sectionHint: {
      flexShrink: 1,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      lineHeight: 16,
      textAlign: 'right',
    },
    quickActionCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    quickActionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    quickActionTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
    },
    quickActionBody: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 16,
    },
    conversationTile: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? '#E5EAF1' : 'rgba(159, 176, 202, 0.14)',
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    conversationTileActive: {
      borderColor: theme.colors.accent,
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
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
    },
    tileCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    tileTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '900',
    },
    tileTime: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 10,
      fontWeight: '700',
    },
    tileMeta: {
      flex: 1,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 16,
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
      fontSize: 13,
      lineHeight: 18,
    },
    groupAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileStatusDot: {
      width: 9,
      height: 9,
      borderRadius: 999,
      backgroundColor: theme.colors.success,
    },
    tileStatusDotMuted: {
      backgroundColor: theme.colors.muted,
    },
    tileStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    tileStatusText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },
    unreadBubble: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadBubbleText: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '800',
    },
    contactRow: {
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 2,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    contactActionButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyStateCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
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
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -6,
    },
    conversationStatusDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.success,
      marginHorizontal: 3,
    },
    conversationHeader: {
      gap: 4,
      paddingHorizontal: isPhone ? 8 : 0,
      paddingTop: isPhone ? 2 : 0,
      paddingBottom: isPhone ? 7 : 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
    },
    conversationHeaderTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: isPhone ? 6 : 10,
    },
    conversationHeaderMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    groupAvatarLarge: {
      width: isPhone ? 40 : 48,
      height: isPhone ? 40 : 48,
      borderRadius: isPhone ? 20 : 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    conversationCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    conversationTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 17 : 22,
      lineHeight: isPhone ? 21 : 28,
    },
    conversationSubtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: isPhone ? 12 : 13,
      lineHeight: isPhone ? 15 : 18,
      maxWidth: 780,
    },
    conversationHeaderActions: {
      flexDirection: 'row',
      gap: isPhone ? 5 : 8,
      alignSelf: 'center',
    },
    conversationActionButton: {
      width: isPhone ? 38 : 44,
      height: isPhone ? 38 : 44,
      borderRadius: isPhone ? 19 : 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    conversationActionButtonActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.infoSoft,
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
      gap: 6,
    },
    headerMetaPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    headerMetaPill: {
      minHeight: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerMetaPillText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '800',
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
      flexGrow: 1,
      gap: 7,
      paddingHorizontal: isPhone ? 10 : 0,
      paddingTop: 8,
      paddingBottom: 10,
    },
    dateSeparator: {
      alignSelf: 'center',
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginVertical: 2,
    },
    dateSeparatorText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '700',
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    messageRowOwn: {
      justifyContent: 'flex-end',
    },
    messageRowSystem: {
      justifyContent: 'center',
    },
    messageBubble: {
      maxWidth: isPhone ? '88%' : '78%',
      minWidth: 0,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 5,
    },
    messageBubbleOwn: {
      backgroundColor: theme.colors.accent,
      borderBottomRightRadius: 5,
    },
    messageBubbleOther: {
      borderBottomLeftRadius: 5,
    },
    systemMessageBubble: {
      alignSelf: 'center',
      maxWidth: isPhone ? '92%' : 420,
      borderWidth: 1,
      borderColor: theme.colors.warning,
      backgroundColor: theme.mode === 'light' ? '#FFF8E7' : 'rgba(245, 158, 11, 0.12)',
    },
    messageBubbleAudio: {
      minWidth: isPhone ? 220 : 260,
      maxWidth: isPhone ? '88%' : 320,
    },
    messageBubbleMedia: {
      paddingHorizontal: 7,
      paddingVertical: 7,
      width: isPhone ? '78%' : 280,
    },
    mediaContainer: {
      gap: 6,
    },
    mediaPreviewShell: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceAlt,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 12px 24px rgba(4, 16, 27, 0.18)',
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.16,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          }),
    },
    messageImage: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 16,
      maxHeight: isPhone ? 260 : 320,
    },
    messageVideo: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: 16,
      maxHeight: isPhone ? 220 : 280,
    },
    mediaLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.34)',
    },
    mediaErrorBox: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surfaceAlt,
    },
    mediaStateText: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
      textAlign: 'center',
    },
    videoUnavailableBox: {
      minHeight: 150,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: 16,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.line,
    },
    videoUnavailableTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '900',
      textAlign: 'center',
    },
    videoUnavailableText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
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
      gap: 8,
      minWidth: 0,
    },
    messageSender: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '800',
      flexShrink: 1,
    },
    systemMessageSender: {
      color: theme.colors.warning,
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    messageSenderOwn: {
      color: '#FFFFFF',
    },
    messageMeta: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 10,
      fontWeight: '700',
      flexShrink: 0,
    },
    messageMetaOwn: {
      color: 'rgba(255,255,255,0.76)',
    },
    messageText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 20,
      flexShrink: 1,
    },
    messageTextOwn: {
      color: '#FFFFFF',
    },
    deliveryMeta: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: -1,
    },
    deliveryMetaText: {
      fontFamily: Typography.body,
      fontSize: 10,
      fontWeight: '700',
    },
    voiceMessageCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      minWidth: 0,
    },
    voicePlayButton: {
      width: 36,
      height: 36,
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
      minWidth: 0,
      gap: 2,
    },
    voiceTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    voiceTitleOwn: {
      color: '#FFFFFF',
    },
    voiceMeta: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '700',
    },
    voiceMetaOwn: {
      color: 'rgba(255,255,255,0.76)',
    },
    voiceMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    voiceStateText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    voiceProgressTrack: {
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    voiceProgressTrackOwn: {
      backgroundColor: 'rgba(255,255,255,0.24)',
    },
    voiceProgressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
    },
    voiceProgressFillOwn: {
      backgroundColor: '#FFFFFF',
    },
    voiceErrorInline: {
      color: theme.colors.warning,
      fontFamily: Typography.body,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },
    retryMessageButton: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginTop: 2,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    retryMessageText: {
      color: theme.colors.danger,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '800',
    },
    retryMessageTextOwn: {
      color: '#FFFFFF',
    },
    composerShell: {
      flexShrink: 0,
      gap: 6,
      paddingHorizontal: isPhone ? 10 : 0,
      paddingTop: 8,
      paddingBottom: isPhone ? 8 : 0,
      borderTopWidth: 1,
      borderTopColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
    },
    composerBar: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    composerInputShell: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      maxHeight: 92,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    composerInput: {
      minHeight: 28,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: 'top',
    },
    attachButton: {
      width: 44,
      height: 44,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    voiceButton: {
      width: 44,
      height: 44,
      borderRadius: 17,
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendIconButton: {
      width: 44,
      height: 44,
      borderRadius: 17,
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
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
    sheetBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(7, 11, 19, 0.28)',
      paddingHorizontal: isPhone ? 12 : 24,
      paddingBottom: isPhone ? 10 : 24,
    },
    bottomSheet: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '82%',
      alignSelf: 'center',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 18,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 18px 38px rgba(4, 16, 27, 0.18)',
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }),
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.line,
      alignSelf: 'center',
      marginBottom: 14,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 12,
    },
    sheetBackButton: {
      width: 34,
      height: 34,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    sheetTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 20,
      lineHeight: 25,
    },
    sheetSubtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    sheetActionList: {
      gap: 8,
    },
    sheetActionRow: {
      minHeight: 56,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    sheetList: {
      maxHeight: 420,
    },
    sheetListContent: {
      gap: 8,
      paddingBottom: 4,
    },
    sheetEmptyState: {
      minHeight: 180,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    sheetEmptyTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 17,
      textAlign: 'center',
    },
    sheetEmptyText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      maxWidth: 320,
    },
    sheetActionIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetActionIconInfo: {
      backgroundColor: theme.colors.infoSoft,
    },
    sheetActionIconDanger: {
      backgroundColor: theme.colors.dangerSoft,
    },
    sheetActionText: {
      flex: 1,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
    },
    driverActionRow: {
      minHeight: 68,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    driverActionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    driverActionName: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '900',
    },
    driverActionUnit: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 16,
    },
    driverStatusPill: {
      flexShrink: 0,
      minHeight: 28,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    driverStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.success,
    },
    driverStatusDotWarning: {
      backgroundColor: theme.colors.warning,
    },
    driverStatusDotDanger: {
      backgroundColor: theme.colors.danger,
    },
    driverStatusDotMuted: {
      backgroundColor: theme.colors.muted,
    },
    driverStatusText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '800',
    },
    optionsSheet: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      paddingVertical: 8,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 18px 38px rgba(4, 16, 27, 0.18)',
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }),
    },
    optionRow: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.line,
    },
    optionRowText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '800',
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
