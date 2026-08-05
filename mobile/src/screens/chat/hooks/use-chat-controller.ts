import { DesignSystem } from '@/constants/theme';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from '@/src/native/audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useShallow } from 'zustand/react/shallow';
import { canConversationStartCall } from '@/src/features/calls/call-selectors';
import { useCallStore } from '@/src/features/calls/call-store';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
} from '@/src/native/image-picker';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { ConversationChannelMode } from '@/src/types/app';
import { createStyles } from '../chat-screen.styles';
import type {
  CallMode,
  DirectoryMode,
  LocalTextMessage,
  MobilePane,
  RecordingState,
} from '../types';
import { MAX_VOICE_NOTE_SECONDS } from '../types';
import { getPresenceStatus } from '@/src/utils/presence';
import { createClientMessageId } from '@/src/utils/chat-message-id';
import { useChatDirectoryData } from './use-chat-directory-data';
import { useChatScroll } from './use-chat-scroll';

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
    loadChatConversation,
    loadOlderChatMessages,
    messagesByConversation,
    chatPageInfoByConversation,
    isLoadingOlderChatByConversation,
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
      loadChatConversation: state.loadChatConversation,
      loadOlderChatMessages: state.loadOlderChatMessages,
      messagesByConversation: state.messagesByConversation,
      chatPageInfoByConversation: state.chatPageInfoByConversation,
      isLoadingOlderChatByConversation: state.isLoadingOlderChatByConversation,
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

  const styles = useMemo(
    () => createStyles(theme, isCompact, isPhone),
    [theme, isCompact, isPhone]
  );
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
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [pendingTextMessages, setPendingTextMessages] = useState<LocalTextMessage[]>([]);
  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);
  const [typingClock, setTypingClock] = useState(() => Date.now());
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
    const timer = setInterval(() => setTypingClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) return;

    if (chatConversations.length) {
      bootstrappedRef.current = true;
      const preferredConversation =
        chatConversations.find(
          (conversation) => conversation.kind === 'group' && conversation.channelMode === 'chat'
        ) || chatConversations[0];

      if (preferredConversation?.id) {
        setActiveConversationId(preferredConversation.id);
        if (messagesByConversation[preferredConversation.id] === undefined) {
          loadChatConversation(preferredConversation.id).catch(() => undefined);
        }
      }
      return;
    }

    bootstrappedRef.current = true;
    openGeneralConversation('chat').then((conversation) => {
      if (conversation?.id && isCompact) setMobilePane('conversation');
    });
  }, [
    chatConversations,
    isCompact,
    loadChatConversation,
    openGeneralConversation,
    messagesByConversation,
    setActiveConversationId,
  ]);

  useEffect(() => {
    if (!chatConversations.length) return;
    const isCurrentConversationAvailable = chatConversations.some(
      (conversation) => conversation.id === activeConversationId
    );
    if (isCurrentConversationAvailable) return;

    const fallbackConversation =
      chatConversations.find((conversation) => conversation.kind === 'group') ||
      chatConversations[0];
    setActiveConversationId(fallbackConversation.id);
    if (messagesByConversation[fallbackConversation.id] === undefined) {
      loadChatConversation(fallbackConversation.id).catch(() => undefined);
    }
  }, [
    activeConversationId,
    chatConversations,
    loadChatConversation,
    messagesByConversation,
    setActiveConversationId,
  ]);

  useEffect(() => {
    if (!isCompact) setMobilePane('conversation');
  }, [isCompact]);

  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    nativeVoiceRecorder.stop().catch(() => undefined);
    webRecorderRef.current?.stop?.();
    webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
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
        peerName: activeConversation.title,
      });
      if (result.ok) {
        setCallNotice(null);
        return;
      }

      const notice =
        result.code === 'busy' || result.code === 'caller_busy' || result.code === 'busy_local'
          ? 'La unidad esta ocupada en otra llamada.'
          : result.code === 'direct_call_required'
            ? 'Solo se puede llamar en conversaciones directas.'
            : result.code === 'no_socket'
              ? 'Reconectando el canal de llamadas. Intenta nuevamente.'
              : 'No fue posible iniciar la llamada.';
      setCallNotice(notice);
    },
    [activeConversation]
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
  const sortedOperationalContacts = useMemo(
    () =>
      (chatContacts || []).slice().sort((left, right) => {
        const rank = (userId: string) => {
          const presence = getPresenceStatus(presenceByUser, userId);
          return presence === 'online' ? 0 : presence === 'offline' ? 2 : 1;
        };
        const statusDiff = rank(left.id) - rank(right.id);
        return statusDiff || left.name.localeCompare(right.name);
      }),
    [chatContacts, presenceByUser]
  );

  const setAttachmentMenuOpen = useCallback((open: boolean) => {
    if (open) setAttachmentMenuMode('conversation');
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

  const activeChatPageInfo = activeConversation
    ? chatPageInfoByConversation[activeConversation.id] || null
    : null;
  const isLoadingOlderMessages = activeConversation
    ? Boolean(isLoadingOlderChatByConversation[activeConversation.id])
    : false;
  const handleChatMessagesScroll = useCallback(
    (event: Parameters<typeof handleMessagesScroll>[0]) => {
      handleMessagesScroll(event);
      if (
        event.nativeEvent.contentOffset.y <= 80 &&
        activeConversation &&
        activeChatPageInfo?.hasMore &&
        !isLoadingOlderMessages
      ) {
        void loadOlderChatMessages(activeConversation.id);
      }
    },
    [
      activeChatPageInfo?.hasMore,
      activeConversation,
      handleMessagesScroll,
      isLoadingOlderMessages,
      loadOlderChatMessages,
    ]
  );

  const startRecordingTicker = () => {
    recordStartedAtRef.current = Date.now();
    setRecordingSeconds(0);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = setInterval(() => {
      if (!recordStartedAtRef.current) return;
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

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    if (isCompact) setMobilePane('conversation');
    if (messagesByConversation[conversationId] === undefined) {
      loadChatConversation(conversationId).catch(() => undefined);
    }
  };

  const routeConversationId = String(
    (route.params as { conversationId?: string } | undefined)?.conversationId || ''
  ).trim();

  useEffect(() => {
    if (!routeConversationId || handledRouteConversationRef.current === routeConversationId) return;
    handledRouteConversationRef.current = routeConversationId;
    handleSelectConversation(routeConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeConversationId]);

  const handleOpenGeneral = async (channelMode: ConversationChannelMode) => {
    const conversation = await openGeneralConversation(channelMode);
    if (conversation?.id && isCompact) setMobilePane('conversation');
  };

  const handleOpenDirect = async (
    contactId: string,
    channelMode: ConversationChannelMode = 'chat'
  ) => {
    const conversation = await openDirectConversation(contactId, channelMode);
    if (conversation?.id && isCompact) setMobilePane('conversation');
  };

  const handleSendText = async () => {
    if (!activeConversation || !draft.trim()) return;
    const text = draft.trim();
    const clientMessageId = createClientMessageId();
    const localId = `local-${clientMessageId}`;
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
      clientMessageId,
    };

    shouldScrollAfterSendRef.current = true;
    setPendingTextMessages((current) => [...current, localMessage]);
    try {
      const result = await sendMessage(activeConversation.id, text, clientMessageId);
      if (!result || result.ok) {
        setDraft('');
        setPendingTextMessages((current) => current.filter((message) => message.id !== localId));
        return;
      }
    } catch {
      // El mensaje optimista conserva el texto para reintento.
    }
    setPendingTextMessages((current) =>
      current.map((message) =>
        message.id === localId ? { ...message, localStatus: 'failed' } : message
      )
    );
  };

  const handleRetryTextMessage = async (message: LocalTextMessage) => {
    if (!message.conversationId || message.localStatus !== 'failed') return;
    shouldScrollAfterSendRef.current = true;
    setPendingTextMessages((current) =>
      current.map((entry) =>
        entry.id === message.id
          ? { ...entry, localStatus: 'sending', createdAt: new Date().toISOString() }
          : entry
      )
    );
    const result = await sendMessage(
      message.conversationId,
      message.retryText,
      message.clientMessageId
    );
    if (!result || result.ok) {
      setPendingTextMessages((current) => current.filter((entry) => entry.id !== message.id));
      return;
    }
    setPendingTextMessages((current) =>
      current.map((entry) =>
        entry.id === message.id ? { ...entry, localStatus: 'failed' } : entry
      )
    );
  };

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
    setRecorderMessage(result.message || 'Nota de voz enviada.');
    setRecordingState('idle');
    return true;
  };

  const retryVoiceNote = async () => {
    if (!failedVoiceNote) return;
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
    if (!activeConversation) return;
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
    const stream = await mediaDevices.getUserMedia({ audio: true });
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
      ? new MediaRecorderCtor(stream, { mimeType: preferredMimeType })
      : new MediaRecorderCtor(stream);
    webStreamRef.current = stream;
    webRecorderRef.current = recorder;
    webChunksRef.current = [];
    recorder.ondataavailable = (event: any) => {
      if (event.data?.size) webChunksRef.current.push(event.data);
    };
    recorder.start();
    startRecordingTicker();
    setRecorderMessage('Grabando nota de voz...');
    setRecordingState('recording');
  };

  const stopWebRecording = async () => {
    if (!activeConversation || !webRecorderRef.current) return;
    setRecordingState('uploading');
    const recorder = webRecorderRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';
    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - Number(recordStartedAtRef.current || Date.now())) / 1000)
    );
    await new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(webChunksRef.current, { type: mimeType });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: mimeType });
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
    if (!activeConversation || !canRecord) return;
    try {
      if (recordingState === 'recording') {
        if (Platform.OS === 'web') await stopWebRecording();
        else await stopNativeRecording();
        return;
      }
      if (Platform.OS === 'web') await startWebRecording();
      else await startNativeRecording();
    } catch (error) {
      stopRecordingTicker();
      setRecordingState('idle');
      setRecorderMessage(
        error instanceof Error ? error.message : 'No fue posible usar el microfono.'
      );
    }
  };

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
      if (asset.mimeType?.startsWith('image/')) formData.append('caption', draft || '');
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
  }, [activeConversation, draft, sendMediaMessage]);

  const activeTypingUsers = useMemo(
    () =>
      activeConversation
        ? (typingByConversation[activeConversation.id] || []).filter(
            (entry) => typingClock - entry.startedAt < 5000
          )
        : [],
    [activeConversation, typingByConversation, typingClock]
  );

  const showDirectoryPanel = !isCompact || mobilePane === 'directory';
  const showConversationPanel = !isCompact || mobilePane === 'conversation';
  const isMobileConversation = isCompact && mobilePane === 'conversation';

  return {
    activeAudioMessageId,
    activeContact,
    activeConversation,
    activeMessageItems,
    attachmentMenuOpen,
    attachmentMenuMode,
    attachmentNotice,
    callNotice,
    canRecord,
    canSendText,
    canStartCall: canConversationStartCall(activeConversation),
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
    handleChatMessagesScroll,
    handleOpenDirect,
    handleOpenGeneral,
    openDirectoryMenu,
    handleSelectConversation,
    handleRetryTextMessage,
    handleSendText,
    handleVoiceAction,
    isCompact,
    isMobileConversation,
    isNearMessagesBottomRef,
    isPhone,
    isSubmitting,
    isLoadingOlderMessages,
    hasOlderMessages: Boolean(activeChatPageInfo?.hasMore),
    markAsRead,
    emitTyping,
    activeTypingUsers,
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
    token,
    user,
  };
}
