import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  stopActiveAudioPlaybackAsync,
  enqueuePttAudioFrame,
  startPttAudioCapture,
  startPttAudioPlayback,
  startRadioForegroundService,
  stopPttAudioCapture,
  stopPttAudioPlayback,
  stopRadioForegroundService,
  subscribeToPttAudioErrors,
  subscribeToPttAudioFrames,
  subscribeToPttAudioLevel,
  useAudioRecorder,
} from '@/src/native/audio';
import * as Haptics from '@/src/native/haptics';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { formatRelativeTime, formatRole } from '@/src/utils/format';
import { getRadioConnectionStatus } from '@/src/utils/radio-status';
import { getTextInputProps } from '@/src/utils/text-input-props';
import { createStyles } from './radio-screen.styles';
import { VoiceTransmissionCard } from './components/radio-transmission-card';
import {
  INITIAL_RADIO_PAGE_INDEX,
  MAX_RADIO_NOTE_SECONDS,
  MIN_RADIO_NOTE_SECONDS,
  RADIO_PAGES,
} from './constants';
import { initialRadioEngineState, radioReducer } from './reducers/radio-reducer';
import { getDeviceDisplayName, getTimeDomainVolume, normalizeMeteringDecibels, withRadioTimeout } from './services/radio-audio-service';
import { useRadioLifecycle } from './hooks/use-radio-lifecycle';
import {
  RadioRealtimeService,
  type RadioLiveIdentity,
  type RadioRealtimeConnectionState,
} from './services/radio-realtime-service';
import type {
  ActivePlaybackState,
  AudioFilter,
  AudioPermissionState,
  RadioMetrics,
  RadioOperationalPhase,
  RadioPageIndex,
  RecordingState,
  VoicePlaybackChangeMeta,
  VoicePlaybackPhase,
} from './types';
import {
  formatDuration,
  getAverageDuration,
  getContactSearchText,
  getConversationContact,
  getConversationPreview,
  isDevelopmentRuntime,
  isLivePlaybackPhase,
  isValidRadioPhaseTransition,
  logRadioDevelopmentEvent,
} from './utils/radio-format';

const WAVE_BAR_BASE_STYLE = { width: 8, borderRadius: 999 };

export function RadioScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1080;
  const isPhone = width < 720;
  const isWideRadioLayout = width >= 1500;
  const { theme } = useAppTheme();
  const {
    activeConversationId,
    chatContacts,
    conversations,
    isSubmitting,
    loadChatContacts,
    loadConversation,
    messagesByConversation,
    networkStatus,
    openDirectConversation,
    openGeneralConversation,
    pendingSyncCount,
    sendVoiceMessage,
    socketStatus,
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
      networkStatus: state.networkStatus,
      openDirectConversation: state.openDirectConversation,
      openGeneralConversation: state.openGeneralConversation,
      pendingSyncCount: state.pendingSyncCount,
      sendVoiceMessage: state.sendVoiceMessage,
      socketStatus: state.socketStatus,
      token: state.token,
      user: state.user,
    }))
  );

  const styles = useMemo(
    () => createStyles(theme, isDesktop, isPhone, isWideRadioLayout),
    [theme, isDesktop, isPhone, isWideRadioLayout]
  );
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recorderMessage, setRecorderMessage] = useState<string | null>(null);
  const [liveOperator, setLiveOperator] = useState<RadioLiveIdentity | null>(null);
  const [isReceivingLive, setIsReceivingLive] = useState(false);
  const [isChannelBusy, setIsChannelBusy] = useState(false);
  const [realtimeConnectionState, setRealtimeConnectionState] =
    useState<RadioRealtimeConnectionState>('idle');

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('default');
  const [selectedOutputId, setSelectedOutputId] = useState<string>('default');
  const [showSettings, setShowSettings] = useState(false);
  const [audioPermissionState, setAudioPermissionState] = useState<AudioPermissionState>('unknown');
  const [hoveredRadioItemId, setHoveredRadioItemId] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<RadioPageIndex>(INITIAL_RADIO_PAGE_INDEX);
  const [pagerWidth, setPagerWidth] = useState(0);
  const [audioFilter, setAudioFilter] = useState<AudioFilter>('all');
  const [activePlayback, setActivePlayback] = useState<ActivePlaybackState>(null);
  const [radioEngineState, dispatchRadioEngine] = useReducer(
    radioReducer,
    initialRadioEngineState
  );
  const radioPhase = radioEngineState.phase;
  const radioMetrics = radioEngineState.metrics;

  const pagerRef = useRef<ScrollView>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedAtRef = useRef<number | null>(null);
  const uploadStartedAtRef = useRef<number | null>(null);
  const playbackTerminalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressToTalkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressToTalkActiveRef = useRef(false);
  const pressToTalkTriggeredRef = useRef(false);
  const pttBusyRef = useRef(false);
  const pendingStopAfterStartRef = useRef(false);
  const idleStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPttBlockReasonRef = useRef<string | null>(null);
  const maxRecordingStopRequestedRef = useRef(false);
  const webRecorderRef = useRef<any>(null);
  const webStreamRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const bootstrappedRef = useRef(false);
  const receivedVoiceNoteIdsRef = useRef<Set<string>>(new Set());
  const meteringFrameRef = useRef<number | null>(null);
  const meteringCleanupRef = useRef<(() => void) | null>(null);
  const meteringActiveRef = useRef(false);
  const recordingStateRef = useRef<RecordingState>('idle');
  const radioPhaseRef = useRef<RadioOperationalPhase>('IDLE');
  const lastSocketStatusRef = useRef(socketStatus);
  const realtimeServiceRef = useRef<RadioRealtimeService | null>(null);
  const liveTransmissionIdRef = useRef<string | null>(null);
  const liveSequenceRef = useRef(0);
  const pulseValue = useSharedValue(1);
  const haloValue = useSharedValue(0);
  const volumeValue = useSharedValue(0);
  const setRecordingMode = useCallback((nextState: RecordingState) => {
    recordingStateRef.current = nextState;
    setRecordingState(nextState);
  }, []);

  const nativeRecorder = useAudioRecorder(
    { ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true },
    (status) => {
      const recordingStatus = status as { isRecording?: boolean; metering?: number };

      if (recordingStatus.isRecording) {
        const normalized = normalizeMeteringDecibels(recordingStatus.metering);
        volumeValue.value = volumeValue.value * 0.28 + normalized * 0.72;
      } else if (!recordingStatus.isRecording) {
        volumeValue.value = 0;
      }
    }
  );

  const radioChannels = useMemo(
    () => conversations.filter((conversation) => conversation.channelMode === 'radio'),
    [conversations]
  );
  const activeChannel =
    radioChannels.find((conversation) => conversation.id === activeChannelId) ||
    radioChannels[0] ||
    null;
  const loadedVoiceNotes = useMemo(
    () =>
      radioChannels
        .flatMap((channel) =>
          (messagesByConversation[channel.id] || [])
            .filter((message) => message.kind === 'audio')
            .map((message) => ({
              id: `${channel.id}-${message.id}`,
              channelId: channel.id,
              channelTitle: channel.title,
              message,
            }))
        )
        .sort(
          (left, right) =>
            new Date(right.message.createdAt).getTime() -
            new Date(left.message.createdAt).getTime()
        ),
    [messagesByConversation, radioChannels]
  );
  const hasCurrentChannelAudio = useMemo(
    () => Boolean(activeChannel && loadedVoiceNotes.some((item) => item.channelId === activeChannel.id)),
    [activeChannel, loadedVoiceNotes]
  );
  const hasOwnAudio = useMemo(
    () => Boolean(user?.id && loadedVoiceNotes.some((item) => item.message.sender?.id === user.id)),
    [loadedVoiceNotes, user?.id]
  );
  const availableAudioFilters = useMemo(() => {
    if (!loadedVoiceNotes.length) {
      return [];
    }

    const filters: { key: AudioFilter; label: string }[] = [{ key: 'all', label: 'Todos' }];

    if (hasCurrentChannelAudio) {
      filters.push({ key: 'current', label: 'Canal actual' });
    }

    if (hasOwnAudio) {
      filters.push({ key: 'mine', label: 'Mis audios' });
    }

    return filters;
  }, [hasCurrentChannelAudio, hasOwnAudio, loadedVoiceNotes.length]);
  const filteredVoiceNotes = useMemo(() => {
    if (audioFilter === 'current' && activeChannel) {
      return loadedVoiceNotes.filter((item) => item.channelId === activeChannel.id);
    }

    if (audioFilter === 'mine' && user?.id) {
      return loadedVoiceNotes.filter((item) => item.message.sender?.id === user.id);
    }

    return loadedVoiceNotes;
  }, [activeChannel, audioFilter, loadedVoiceNotes, user?.id]);
  const activePlaybackMessageId = activePlayback?.messageId || null;

  useEffect(() => {
    if (audioFilter === 'current' && !hasCurrentChannelAudio) {
      setAudioFilter('all');
    }

    if (audioFilter === 'mine' && !hasOwnAudio) {
      setAudioFilter('all');
    }
  }, [audioFilter, hasCurrentChannelAudio, hasOwnAudio]);
  const searchTerm = search.trim().toLowerCase();
  const filteredChannels = useMemo(
    () =>
      radioChannels.filter((conversation) => {
        if (!searchTerm) {
          return true;
        }

        const contact = getConversationContact(conversation, user?.id);
        return [
          conversation.title,
          conversation.description || '',
          getConversationPreview(conversation),
          contact?.name || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(searchTerm);
      }),
    [radioChannels, searchTerm, user?.id]
  );
  const filteredContacts = useMemo(
    () =>
      chatContacts.filter((contact) =>
        searchTerm ? getContactSearchText(contact).includes(searchTerm) : true
      ),
    [chatContacts, searchTerm]
  );
  const supportsTapToTalk =
    Platform.OS !== 'web' ||
    (typeof globalThis !== 'undefined' &&
      Boolean((globalThis as any).navigator?.mediaDevices?.getUserMedia) &&
      typeof (globalThis as any).MediaRecorder !== 'undefined');
  const isRadioTransmitting = recordingState === 'recording' || recordingState === 'uploading';
  const isHistoryPlaybackActive = Boolean(activePlayback && isLivePlaybackPhase(activePlayback.phase));
  const radioConnection = useMemo(
    () =>
      getRadioConnectionStatus(socketStatus, {
        hasUser: Boolean(user),
        isReceiving: false,
        isTransmitting: isRadioTransmitting,
        networkStatus,
        pendingSyncCount,
        radioChannelReady: Boolean(activeChannel),
      }),
    [
      activeChannel,
      isRadioTransmitting,
      networkStatus,
      pendingSyncCount,
      socketStatus,
      user,
    ]
  );
  const isBusy = isSubmitting || recordingState === 'uploading';
  const pttBlockReason = !supportsTapToTalk
    ? 'Audio API no disponible'
    : audioPermissionState === 'denied'
      ? Platform.OS === 'web'
        ? 'Mic bloqueado'
        : 'Toca para reintentar microfono'
      : isReceivingLive || isChannelBusy
        ? `Canal ocupado por ${liveOperator?.name || 'otro operador'}`
      : isBusy
        ? 'Transmision en curso'
        : !activeChannel
          ? 'Sin canal activo'
          : !radioConnection.canTransmit
              ? radioConnection.detail
              : null;
  const isPttDisabled =
    !supportsTapToTalk ||
    (Platform.OS === 'web' && audioPermissionState === 'denied') ||
    isBusy ||
    isReceivingLive ||
    isChannelBusy ||
    !activeChannel ||
    (!radioConnection.canTransmit && recordingState !== 'recording');
  const incrementRadioMetrics = useCallback((patch: Partial<RadioMetrics>) => {
    dispatchRadioEngine({ type: 'INCREMENT_METRICS', patch });
  }, []);
  const resolvedRadioPhase = useMemo<RadioOperationalPhase>(() => {
    if (networkStatus === 'offline' || radioConnection.state === 'DISCONNECTED') {
      return 'OFFLINE';
    }

    if (realtimeConnectionState === 'unauthorized') {
      return 'UNAUTHORIZED';
    }

    if (
      realtimeConnectionState === 'reconnecting' ||
      socketStatus === 'connecting' ||
      socketStatus === 'reconnecting' ||
      networkStatus === 'recovering' ||
      radioConnection.state === 'CONNECTING' ||
      radioConnection.state === 'AUTHENTICATING' ||
      radioConnection.state === 'RECONNECTING'
    ) {
      return realtimeConnectionState === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING';
    }

    if (recordingState === 'error' || radioConnection.state === 'ERROR') {
      return 'ERROR';
    }

    if (recordingState === 'recording') {
      return 'TRANSMITTING';
    }

    if (isReceivingLive) {
      return 'RECEIVING';
    }

    if (isChannelBusy) {
      return 'CHANNEL_BUSY';
    }

    if (recordingState === 'uploading') {
      return 'UPLOADING';
    }

    if (radioConnection.canTransmit && activeChannel) {
      return 'READY';
    }

    return 'IDLE';
  }, [activeChannel, isChannelBusy, isReceivingLive, networkStatus, radioConnection, realtimeConnectionState, recordingState, socketStatus]);

  useEffect(() => {
    const service = new RadioRealtimeService({
      onBusy: ({ transmitter }) => {
        setLiveOperator(transmitter || null);
        setIsChannelBusy(true);
        setRecorderMessage('Canal ocupado');
      },
      onEnd: ({ transmissionId }) => {
        setIsChannelBusy(false);
        if (liveTransmissionIdRef.current !== transmissionId) {
          setLiveOperator(null);
          setRecorderMessage(null);
          return;
        }
        liveTransmissionIdRef.current = null;
        setIsReceivingLive(false);
        setIsChannelBusy(false);
        setLiveOperator(null);
        volumeValue.value = 0;
        stopPttAudioPlayback().catch(() => undefined);
        if (recordingStateRef.current !== 'recording') setRecorderMessage(null);
      },
      onError: (message) => {
        const transmissionId = liveTransmissionIdRef.current;
        if (transmissionId && recordingStateRef.current === 'recording') {
          realtimeServiceRef.current?.endTransmission(transmissionId).catch(() => undefined);
        }
        stopPttAudioCapture().catch(() => undefined);
        stopPttAudioPlayback().catch(() => undefined);
        liveTransmissionIdRef.current = null;
        setIsReceivingLive(false);
        if (recordingStateRef.current === 'recording') setRecordingMode('idle');
        setRecorderMessage(message);
      },
      onFrame: (frame) => {
        if (frame.transmissionId !== liveTransmissionIdRef.current) return;
        enqueuePttAudioFrame(frame.data).catch(() => undefined);
      },
      onReady: () => {
        if (recordingStateRef.current === 'idle') setRecorderMessage(null);
      },
      onStateChange: setRealtimeConnectionState,
      onStart: ({ transmissionId, transmitter }) => {
        setIsChannelBusy(false);
        liveTransmissionIdRef.current = transmissionId;
        setLiveOperator(transmitter);
        if (transmitter.id === user?.id) return;
        setIsReceivingLive(true);
        setRecorderMessage(`Recibiendo: ${transmitter.name}`);
        stopActiveAudioPlaybackAsync()
          .then(() => startPttAudioPlayback())
          .catch((error) => setRecorderMessage(error instanceof Error ? error.message : 'Audio no disponible'));
      },
    });
    realtimeServiceRef.current = service;
    return () => {
      service.disconnect();
      realtimeServiceRef.current = null;
      stopPttAudioCapture().catch(() => undefined);
      stopPttAudioPlayback().catch(() => undefined);
    };
  }, [setRecordingMode, user?.id, volumeValue]);

  useEffect(() => {
    if (!token || !activeChannel?.id) return;
    realtimeServiceRef.current?.connect(token, activeChannel.id);
    startRadioForegroundService().catch(() => undefined);
    return () => {
      stopRadioForegroundService().catch(() => undefined);
    };
  }, [activeChannel?.id, token]);

  useEffect(() => {
    const removeFrames = subscribeToPttAudioFrames((frame) => {
      const transmissionId = liveTransmissionIdRef.current;
      if (!transmissionId || recordingStateRef.current !== 'recording') return;
      realtimeServiceRef.current?.sendFrame({
        data: frame.data,
        sequence: liveSequenceRef.current++,
        sentAt: frame.capturedAt,
        transmissionId,
      });
    });
    const removeErrors = subscribeToPttAudioErrors(() => {
      setRecorderMessage('Error al capturar audio PTT.');
      setRecordingMode('error');
    });
    const removeLevel = subscribeToPttAudioLevel(({ level }) => {
      volumeValue.value = volumeValue.value * 0.3 + Math.max(0, Math.min(1, level)) * 0.7;
    });
    return () => {
      removeFrames();
      removeErrors();
      removeLevel();
    };
  }, [setRecordingMode, volumeValue]);

  useEffect(() => {
    dispatchRadioEngine({ type: 'SET_PHASE', phase: resolvedRadioPhase });

    const current = radioPhaseRef.current;
    if (current === resolvedRadioPhase) {
      return;
    }

    const valid = isValidRadioPhaseTransition(current, resolvedRadioPhase);
    radioPhaseRef.current = resolvedRadioPhase;
    logRadioDevelopmentEvent('radio-state', {
      activeChannelId: activeChannel?.id || null,
      next: resolvedRadioPhase,
      previous: current,
      reason: 'operation_phase',
      validTransition: valid,
    });
  }, [activeChannel?.id, resolvedRadioPhase]);

  useEffect(() => {
    const previous = lastSocketStatusRef.current;
    lastSocketStatusRef.current = socketStatus;

    if ((previous === 'reconnecting' || previous === 'disconnected') && socketStatus === 'connected') {
      incrementRadioMetrics({ reconnects: 1 });
      if (activeChannel?.id) {
        loadConversation(activeChannel.id).catch(() => undefined);
      }
    }
  }, [activeChannel?.id, incrementRadioMetrics, loadConversation, socketStatus]);

  useEffect(() => {
    const incomingNotes = loadedVoiceNotes.filter((item) => item.message.senderId !== user?.id);
    let receivedCount = 0;

    incomingNotes.forEach((item) => {
      if (receivedVoiceNoteIdsRef.current.has(item.message.id)) {
        return;
      }

      receivedVoiceNoteIdsRef.current.add(item.message.id);
      receivedCount += 1;
    });

    if (receivedCount) {
      incrementRadioMetrics({ received: receivedCount });
    }
  }, [incrementRadioMetrics, loadedVoiceNotes, user?.id]);

  useEffect(() => {
    const nextReason = isPttDisabled ? pttBlockReason || 'Bloqueado' : null;
    if (lastPttBlockReasonRef.current === nextReason) {
      return;
    }

    lastPttBlockReasonRef.current = nextReason;
    if (nextReason) {
      if (!isDevelopmentRuntime()) {
        return;
      }
      console.info('[radio:ptt] disabled', {
        activeChannel: Boolean(activeChannel),
        canTransmit: radioConnection.canTransmit,
        networkStatus,
        permission: audioPermissionState,
        reason: nextReason,
        historyPlaybackActive: isHistoryPlaybackActive,
        recordingState,
        socketStatus,
        state: radioConnection.state,
        submitting: isSubmitting,
      });
    } else {
      if (!isDevelopmentRuntime()) {
        return;
      }
      console.info('[radio:ptt] enabled', {
        activeChannel: Boolean(activeChannel),
        socketStatus,
        state: radioConnection.state,
      });
    }
  }, [
    activeChannel,
    audioPermissionState,
    isPttDisabled,
    isHistoryPlaybackActive,
    isSubmitting,
    networkStatus,
    pttBlockReason,
    radioConnection,
    recordingState,
    socketStatus,
  ]);

  const pttAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseValue.value }],
  }));

  const haloAnimatedStyle = useAnimatedStyle(() => ({
    opacity: haloValue.value,
    transform: [{ scale: 1 + haloValue.value * 0.18 }],
  }));

  const stopWebMetering = useCallback(() => {
    meteringActiveRef.current = false;

    if (meteringFrameRef.current) {
      cancelAnimationFrame(meteringFrameRef.current);
      meteringFrameRef.current = null;
    }

    meteringCleanupRef.current?.();
    meteringCleanupRef.current = null;
    volumeValue.value = 0;
  }, [volumeValue]);

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  useEffect(() => {
    loadChatContacts();

    if (Platform.OS === 'web') {
      const mediaDevices = navigator.mediaDevices;

      if (!mediaDevices?.enumerateDevices) {
        return undefined;
      }

      const loadDevices = async (requestPermission = false) => {
        try {
          if (requestPermission) {
            const stream = await mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
          }
          const devices = await mediaDevices.enumerateDevices();
          const inputDevices = devices.filter((d) => d.kind === 'audioinput');
          setAudioInputDevices(inputDevices);
          setAudioOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
          setAudioPermissionState(inputDevices.some((device) => device.label) ? 'granted' : 'unknown');
        } catch (err) {
          console.warn('Could not load audio devices', err);
          setAudioPermissionState('denied');
          setRecorderMessage('Mic bloqueado');
        }
      };
      const handleDeviceChange = () => { loadDevices(); };

      loadDevices();
      mediaDevices.addEventListener?.('devicechange', handleDeviceChange);

      return () => {
        mediaDevices.removeEventListener?.('devicechange', handleDeviceChange);
      };
    }

    return undefined;
  }, [loadChatContacts]);

  // Global output sync for Web
  useEffect(() => {
    if (Platform.OS === 'web' && selectedOutputId !== 'default') {
      const applySinkId = () => {
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach((el: any) => {
          if (typeof el.setSinkId === 'function' && el.sinkId !== selectedOutputId) {
            el.setSinkId(selectedOutputId).catch(() => {
              /* Ignore errors for background elements */
            });
          }
        });
      };

      applySinkId();
      const observer = new MutationObserver(applySinkId);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
  }, [selectedOutputId]);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }

    if (radioChannels.length) {
      const preferredChannelId =
        activeConversationId &&
        radioChannels.some((conversation) => conversation.id === activeConversationId)
          ? activeConversationId
          : radioChannels[0].id;

      bootstrappedRef.current = true;
      setActiveChannelId(preferredChannelId);
      loadConversation(preferredChannelId);
      return;
    }

    bootstrappedRef.current = true;
    openGeneralConversation('radio').then((conversation) => {
      if (conversation?.id) {
        setActiveChannelId(conversation.id);
      }
    });
  }, [activeConversationId, loadConversation, openGeneralConversation, radioChannels]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    const matchingChannel = radioChannels.find(
      (conversation) => conversation.id === activeConversationId
    );

    if (!matchingChannel || matchingChannel.id === activeChannelId) {
      return;
    }

    setActiveChannelId(matchingChannel.id);
  }, [activeChannelId, activeConversationId, radioChannels]);

  useEffect(() => {
    if (!radioChannels.length) {
      return;
    }

    const exists = radioChannels.some((conversation) => conversation.id === activeChannelId);

    if (exists) {
      return;
    }

    setActiveChannelId(radioChannels[0].id);
    loadConversation(radioChannels[0].id);
  }, [activeChannelId, loadConversation, radioChannels]);

  useEffect(() => {
    if (!activePlayback) {
      return;
    }

    const messageStillLoaded = loadedVoiceNotes.some(
      (item) => item.message.id === activePlayback.messageId
    );
    const transportHealthy = socketStatus === 'connected';

    if (messageStillLoaded && transportHealthy) {
      return;
    }

    setActivePlayback(null);
    stopActiveAudioPlaybackAsync().catch(() => undefined);
  }, [activePlayback, loadedVoiceNotes, socketStatus]);

  useEffect(() => {
    if (playbackTerminalTimerRef.current) {
      clearTimeout(playbackTerminalTimerRef.current);
      playbackTerminalTimerRef.current = null;
    }

    if (!activePlayback || (activePlayback.phase !== 'FINISHED' && activePlayback.phase !== 'ERROR')) {
      return undefined;
    }

    const terminalMessageId = activePlayback.messageId;
    playbackTerminalTimerRef.current = setTimeout(() => {
      setActivePlayback((current) =>
        current?.messageId === terminalMessageId &&
        (current.phase === 'FINISHED' || current.phase === 'ERROR')
          ? null
          : current
      );
    }, activePlayback.phase === 'ERROR' ? 3200 : 1400);

    return () => {
      if (playbackTerminalTimerRef.current) {
        clearTimeout(playbackTerminalTimerRef.current);
        playbackTerminalTimerRef.current = null;
      }
    };
  }, [activePlayback]);

  useEffect(() => {
    setActivePlayback(null);
    stopActiveAudioPlaybackAsync().catch(() => undefined);
  }, [activeChannelId]);

  useRadioLifecycle({
    idleStatusTimerRef,
    nativeRecorder,
    pendingStopAfterStartRef,
    playbackTerminalTimerRef,
    pressToTalkActiveRef,
    pressToTalkTimerRef,
    pressToTalkTriggeredRef,
    pttBusyRef,
    recordTimerRef,
    setActivePlayback,
    stopWebMetering,
    uploadStartedAtRef,
    webRecorderRef,
    webStreamRef,
  });

  const startRecordingTicker = () => {
    recordStartedAtRef.current = Date.now();
    maxRecordingStopRequestedRef.current = false;
    setRecordingSeconds(0);

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
    }

    recordTimerRef.current = setInterval(() => {
      if (!recordStartedAtRef.current) {
        return;
      }

    const elapsedSeconds = Math.max(
        MIN_RADIO_NOTE_SECONDS,
        Math.round((Date.now() - recordStartedAtRef.current) / 1000)
      );
      setRecordingSeconds(elapsedSeconds);

      if (elapsedSeconds >= MAX_RADIO_NOTE_SECONDS && !maxRecordingStopRequestedRef.current) {
        maxRecordingStopRequestedRef.current = true;
        handleTapToTalk();
      }
    }, 400);
  };

  const stopRecordingTicker = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    recordStartedAtRef.current = null;
    maxRecordingStopRequestedRef.current = false;
    setRecordingSeconds(0);
    volumeValue.value = 0;
  };

  const scheduleIdleAfterStatus = (delayMs = 1400) => {
    if (idleStatusTimerRef.current) {
      clearTimeout(idleStatusTimerRef.current);
    }

    idleStatusTimerRef.current = setTimeout(() => {
      if (recordingStateRef.current === 'sent' || recordingStateRef.current === 'error') {
        setRecordingMode('idle');
      }
    }, delayMs);
  };

  const startWebMetering = (stream: MediaStream) => {
    const AudioContextCtor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;

    stopWebMetering();

    if (!AudioContextCtor) {
      return;
    }

    try {
      const audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.18;
      const samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      meteringActiveRef.current = true;
      meteringCleanupRef.current = () => {
        try {
          source.disconnect();
        } catch {
          // Source may already be disconnected by the browser.
        }
        audioContext.close().catch(() => undefined);
      };

      const updateVolume = () => {
        if (!meteringActiveRef.current || !stream.active) {
          stopWebMetering();
          return;
        }

        analyser.getByteTimeDomainData(samples);
        const nextVolume = getTimeDomainVolume(samples);
        volumeValue.value = volumeValue.value * 0.32 + nextVolume * 0.68;
        meteringFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (error) {
      console.warn('Web Audio Metering failed', error);
    }
  };

  const syncRecordingAnimation = (active: boolean) => {
    if (active) {
      pulseValue.value = withRepeat(
        withSequence(withTiming(1.05, { duration: 420 }), withTiming(1, { duration: 420 })),
        -1,
        true
      );
      haloValue.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
      return;
    }

    pulseValue.value = withSpring(1);
    haloValue.value = withTiming(0, { duration: 220 });
  };

  const handleSelectChannel = async (channelId: string) => {
    setActiveChannelId(channelId);
    await loadConversation(channelId);
  };

  const handleOpenGeneralRadio = async () => {
    const conversation = await openGeneralConversation('radio');

    if (conversation?.id) {
      setActiveChannelId(conversation.id);
    }
  };

  const handleOpenDirectRadio = async (contactId: string) => {
    const conversation = await openDirectConversation(contactId, 'radio');

    if (conversation?.id) {
      setActiveChannelId(conversation.id);
    }
  };

  const goToPage = useCallback(
    (pageIndex: RadioPageIndex) => {
      setActivePageIndex(pageIndex);

      if (pagerWidth) {
        pagerRef.current?.scrollTo({ x: pagerWidth * pageIndex, animated: true });
      }
    },
    [pagerWidth]
  );

  const handlePagerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = Math.round(event.nativeEvent.layout.width);

      if (!nextWidth || nextWidth === pagerWidth) {
        return;
      }

      setPagerWidth(nextWidth);
      requestAnimationFrame(() => {
        pagerRef.current?.scrollTo({
          x: nextWidth * activePageIndex,
          animated: false,
        });
      });
    },
    [activePageIndex, pagerWidth]
  );

  const handlePagerMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!pagerWidth) {
        return;
      }

      const nextIndex = Math.max(
        0,
        Math.min(2, Math.round(event.nativeEvent.contentOffset.x / pagerWidth))
      ) as RadioPageIndex;

      setActivePageIndex(nextIndex);
    },
    [pagerWidth]
  );

  const handleVoicePlaybackChange = useCallback((
    messageId: string,
    phase: VoicePlaybackPhase,
    meta?: VoicePlaybackChangeMeta
  ) => {
    if (phase === 'FINISHED') {
      incrementRadioMetrics({
        playbackCount: 1,
        playbackTotalMs: meta?.elapsedMs || 0,
      });
    }

    setActivePlayback((current) => {
      if (current?.messageId === messageId && current.phase === phase) {
        return current;
      }

      logRadioDevelopmentEvent('radio-state', {
        audioId: meta?.audioId || null,
        messageId,
        next: phase,
        previous: current?.messageId === messageId ? current.phase : current ? `${current.messageId}:${current.phase}` : 'IDLE',
        reason: meta?.reason || 'player_transition',
      });

      if (phase !== 'IDLE') {
        return {
          messageId,
          phase,
          updatedAt: Date.now(),
        };
      }

      return current?.messageId === messageId ? null : current;
    });
  }, [incrementRadioMetrics]);

  const startNativeRecording = async () => {
    if (!activeChannel) {
      return;
    }

    if (!radioConnection.canTransmit) {
      setRecorderMessage(radioConnection.detail);
      return;
    }

    await stopActiveAudioPlaybackAsync().catch(() => undefined);
    setActivePlayback(null);

    const permission = await requestRecordingPermissionsAsync();

    if (!permission.granted) {
      setAudioPermissionState('denied');
      setRecorderMessage('Mic bloqueado');
      setRecordingMode('error');
      scheduleIdleAfterStatus();
      return;
    }

    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    const ack = await realtimeServiceRef.current?.requestTransmission();
    if (!ack?.ok || !ack.transmissionId) {
      setRecorderMessage(ack?.error === 'channel_busy' ? 'Canal ocupado' : 'Radio no disponible');
      return;
    }
    liveTransmissionIdRef.current = ack.transmissionId;
    liveSequenceRef.current = 0;
    try {
      await startPttAudioCapture();
    } catch (error) {
      await realtimeServiceRef.current?.endTransmission(ack.transmissionId);
      liveTransmissionIdRef.current = null;
      throw error;
    }
    startRecordingTicker();
    syncRecordingAnimation(true);
    setLiveOperator(user ? { id: user.id, name: user.name || 'Operador' } : null);
    setRecorderMessage(`Transmitiendo: ${user?.name || 'Operador'}`);
    setAudioPermissionState('granted');
    setRecordingMode('recording');
  };

  const stopNativeRecording = async () => {
    if (!activeChannel) {
      return;
    }

    const transmissionId = liveTransmissionIdRef.current;
    await stopPttAudioCapture();
    stopRecordingTicker();
    syncRecordingAnimation(false);
    if (transmissionId) await realtimeServiceRef.current?.endTransmission(transmissionId);
    liveTransmissionIdRef.current = null;
    setLiveOperator(null);
    incrementRadioMetrics({ sent: 1 });
    setRecorderMessage('Transmision finalizada');
    setRecordingMode('sent');
    scheduleIdleAfterStatus();
  };

  const startWebRecording = async () => {
    if (!activeChannel) {
      return;
    }

    if (!radioConnection.canTransmit) {
      setRecorderMessage(radioConnection.detail);
      return;
    }

    await stopActiveAudioPlaybackAsync().catch(() => undefined);
    setActivePlayback(null);

    const mediaDevices = (globalThis as any).navigator?.mediaDevices;
    const MediaRecorderCtor = (globalThis as any).MediaRecorder;

    if (!mediaDevices?.getUserMedia || !MediaRecorderCtor) {
      setRecorderMessage('No disponible');
      return;
    }

    const stream = await mediaDevices.getUserMedia({
      audio: {
        deviceId: selectedInputId !== 'default' ? { exact: selectedInputId } : undefined,
      },
    });
    setAudioPermissionState('granted');

    const preferredMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
      (mimeType) =>
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
      if (event.data?.size) {
        webChunksRef.current.push(event.data);
      }
    };

    recorder.start();
    startWebMetering(stream);
    startRecordingTicker();
    syncRecordingAnimation(true);
    setRecorderMessage('Grabando');
    setRecordingMode('recording');
  };

  const stopWebRecording = async () => {
    if (!activeChannel || !webRecorderRef.current) {
      return;
    }

    setRecordingMode('uploading');
    uploadStartedAtRef.current = Date.now();
    const recorder = webRecorderRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';
    const rawDurationSeconds = Math.round(
      (Date.now() - Number(recordStartedAtRef.current || Date.now())) / 1000
    );

    const isTooShort = rawDurationSeconds < MIN_RADIO_NOTE_SECONDS;
    const durationSeconds = Math.min(MAX_RADIO_NOTE_SECONDS, rawDurationSeconds);

    try {
      await withRadioTimeout(
        new Promise<void>((resolve, reject) => {
          recorder.onstop = async () => {
            try {
              if (isTooShort) {
                resolve();
                return;
              }

              const blob = new Blob(webChunksRef.current, { type: mimeType });
              const file = new File([blob], `radio-note-${Date.now()}.webm`, { type: mimeType });
              const formData = new FormData();
              formData.append('channelId', activeChannel.id);
              formData.append('durationSeconds', String(durationSeconds));
              formData.append('createdAt', new Date().toISOString());
              if (user?.id) {
                formData.append('userId', user.id);
              }
              formData.append('file', file);
              const result = await sendVoiceMessage(activeChannel.id, formData);
              if (!result.ok) {
                throw new Error(result.message || 'No fue posible enviar la transmision.');
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          };

          try {
            recorder.stop();
          } catch (error) {
            reject(error);
          }
        }),
        50000,
        'Tiempo de espera agotado al enviar la transmision.'
      );

      if (isTooShort) {
        incrementRadioMetrics({ cancelled: 1 });
        setRecorderMessage('Manten presionado al menos 1 segundo');
        setRecordingMode('error');
        scheduleIdleAfterStatus();
        return;
      }

      incrementRadioMetrics({
        sent: 1,
        uploadCount: 1,
        uploadTotalMs: uploadStartedAtRef.current ? Date.now() - uploadStartedAtRef.current : 0,
      });
      uploadStartedAtRef.current = null;
      setRecorderMessage('Enviado');
      setRecordingMode('sent');
      scheduleIdleAfterStatus();
    } finally {
      webRecorderRef.current = null;
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      webStreamRef.current = null;
      webChunksRef.current = [];
      stopWebMetering();
      stopRecordingTicker();
      syncRecordingAnimation(false);
      uploadStartedAtRef.current = null;
      if (recordingStateRef.current === 'uploading') {
        setRecordingMode('idle');
      }
    }
  };

  const requestAudioDeviceAccess = async () => {
    if (Platform.OS !== 'web' || !navigator.mediaDevices?.getUserMedia) {
      setRecorderMessage('No disponible');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputDevices = devices.filter((device) => device.kind === 'audioinput');
      setAudioInputDevices(inputDevices);
      setAudioOutputDevices(devices.filter((device) => device.kind === 'audiooutput'));
      setAudioPermissionState('granted');
      setRecorderMessage(null);
    } catch {
      setAudioPermissionState('denied');
      setRecorderMessage('Mic bloqueado');
    }
  };

  const handleTapToTalk = async () => {
    const currentRecordingState = recordingStateRef.current;

    if (!activeChannel || !supportsTapToTalk || isSubmitting || currentRecordingState === 'uploading' || pttBusyRef.current) {
      return;
    }

    if (currentRecordingState !== 'recording' && !radioConnection.canTransmit) {
      setRecorderMessage(radioConnection.detail);
      return;
    }

    pttBusyRef.current = true;

    try {
      if (currentRecordingState === 'recording') {
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
      stopWebMetering();
      stopRecordingTicker();
      syncRecordingAnimation(false);
      uploadStartedAtRef.current = null;
      setRecordingMode('idle');
      const isPermissionError =
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'NotAllowedError';
      const message = error instanceof Error ? error.message : 'Audio no disponible';
      setRecorderMessage(isPermissionError ? 'Mic bloqueado' : message);
      if (isPermissionError) {
        setAudioPermissionState('denied');
      }
      setRecordingMode('error');
      scheduleIdleAfterStatus(2200);
    } finally {
      pttBusyRef.current = false;

      if (pendingStopAfterStartRef.current && recordingStateRef.current === 'recording') {
        pendingStopAfterStartRef.current = false;
        handleTapToTalk();
        return;
      }

      if (recordingStateRef.current !== 'recording') {
        pendingStopAfterStartRef.current = false;
      }
    }
  };

  const handlePttPressIn = () => {
    if (Platform.OS === 'web' || recordingStateRef.current !== 'idle') {
      return;
    }

    if (pressToTalkTimerRef.current) {
      clearTimeout(pressToTalkTimerRef.current);
    }

    pressToTalkTimerRef.current = setTimeout(() => {
      pressToTalkTriggeredRef.current = true;
      pressToTalkActiveRef.current = true;
      handleTapToTalk();
    }, 180);
  };

  const handlePttPressOut = () => {
    if (pressToTalkTimerRef.current) {
      clearTimeout(pressToTalkTimerRef.current);
      pressToTalkTimerRef.current = null;
    }

    if (!pressToTalkActiveRef.current) {
      return;
    }

    pressToTalkActiveRef.current = false;

    if (recordingStateRef.current === 'recording') {
      if (pttBusyRef.current) {
        pendingStopAfterStartRef.current = true;
        return;
      }

      handleTapToTalk();
      return;
    }

    if (pttBusyRef.current) {
      pendingStopAfterStartRef.current = true;
    }
  };

  const handlePttPress = () => {
    if (pressToTalkTriggeredRef.current) {
      pressToTalkTriggeredRef.current = false;
      return;
    }

    handleTapToTalk();
  };

  if (!user) {
    return null;
  }

  const activeInputName = getDeviceDisplayName(audioInputDevices, selectedInputId, 'Mic');
  const activeOutputName = getDeviceDisplayName(audioOutputDevices, selectedOutputId, 'Salida');
  const averageUploadMs = getAverageDuration(radioMetrics.uploadTotalMs, radioMetrics.uploadCount);
  const averagePlaybackMs = getAverageDuration(radioMetrics.playbackTotalMs, radioMetrics.playbackCount);
  const signalLevel =
    networkStatus === 'offline' || socketStatus === 'disconnected' || socketStatus === 'error'
      ? 0
      : socketStatus === 'reconnecting' || networkStatus === 'recovering'
        ? 2
        : socketStatus === 'connected'
          ? 4
          : 1;
  const permissionTone =
    audioPermissionState === 'denied'
      ? theme.colors.warning
      : audioPermissionState === 'granted'
        ? theme.colors.success
        : theme.colors.muted;
  const liveStatus = (() => {
    switch (radioPhase) {
      case 'TRANSMITTING':
      return {
        detail: 'Transmitiendo en el canal activo',
        icon: 'microphone' as const,
        label: 'Transmitiendo',
        tone: 'danger' as const,
      };
      case 'UPLOADING':
      return {
        detail: 'Enviando audio al canal',
        icon: 'cloud-upload-outline' as const,
        label: 'Enviando',
        tone: 'info' as const,
      };
      case 'RECEIVING':
        return {
          detail: `Recibiendo: ${liveOperator?.name || 'Operador'}`,
          icon: 'volume-high' as const,
          label: 'Recibiendo',
          tone: 'info' as const,
        };
      case 'CHANNEL_BUSY':
        return {
          detail: `Transmitiendo: ${liveOperator?.name || 'Otro operador'}`,
          icon: 'account-voice' as const,
          label: 'Canal ocupado',
          tone: 'warning' as const,
        };
      case 'RECONNECTING':
        return {
          detail: 'Recuperando conexion de Radio',
          icon: 'sync' as const,
          label: 'Reconectando',
          tone: 'info' as const,
        };
      case 'UNAUTHORIZED':
        return {
          detail: 'Vuelve a iniciar sesion',
          icon: 'lock-alert-outline' as const,
          label: 'Sesion expirada',
          tone: 'warning' as const,
        };
      case 'ERROR':
      return {
        detail: recorderMessage || 'Revisa el audio e intenta de nuevo',
        icon: 'alert-circle-outline' as const,
        label: 'Error',
        tone: 'warning' as const,
      };
      case 'CONNECTING':
      case 'OFFLINE':
      return {
        detail: radioConnection.detail,
        icon: radioConnection.state === 'RECONNECTING' ? 'sync' as const : 'access-point-off' as const,
        label: radioConnection.label,
        tone: radioConnection.tone,
      };
      case 'READY':
        return {
          detail: activeChannel?.title || 'Canal operativo listo',
          icon: 'check-circle-outline' as const,
          label: 'Listo',
          tone: 'positive' as const,
        };
      case 'IDLE':
      default:
        return {
          detail: activeChannel?.title || 'Selecciona un canal',
          icon: 'radio-handheld' as const,
          label: activeChannel ? 'En espera' : 'Sin canal',
          tone: activeChannel ? 'neutral' as const : 'warning' as const,
        };
    }
  })();
  const liveStatusColor =
    liveStatus.tone === 'danger'
      ? theme.colors.danger
      : liveStatus.tone === 'warning'
        ? theme.colors.warning
        : liveStatus.tone === 'info'
          ? theme.colors.info
          : liveStatus.tone === 'positive'
            ? theme.colors.success
            : theme.colors.muted;
  const activeOperatorCount = activeChannel?.participants.length || 0;
  const recentActivity = filteredVoiceNotes.slice(0, 3);
  const radioActionText =
    recorderMessage ||
    (radioPhase === 'OFFLINE'
      ? 'Verifica Internet antes de transmitir.'
      : radioPhase === 'CONNECTING'
        ? 'Espera la reconexion del servidor.'
        : audioPermissionState === 'denied'
          ? 'Habilita el microfono para usar PTT.'
          : null);
  const pttDisabledText =
    radioPhase === 'RECEIVING' || radioPhase === 'CHANNEL_BUSY'
      ? liveStatus.label
      : pttBlockReason || 'No disponible';
  const pttStateStyle =
    radioPhase === 'TRANSMITTING'
      ? styles.pttButtonRecording
      : radioPhase === 'UPLOADING'
        ? styles.pttButtonUploading
        : radioPhase === 'RECEIVING' || radioPhase === 'CHANNEL_BUSY'
          ? styles.pttButtonReceiving
          : radioPhase === 'ERROR'
            ? styles.pttButtonError
            : radioPhase === 'OFFLINE' || radioPhase === 'CONNECTING'
              ? styles.pttButtonOffline
              : styles.pttButtonIdle;
  const pageWidth = pagerWidth || width;
  const audioSettingsPanel =
    showSettings && Platform.OS === 'web' ? (
      <View style={styles.settingsPanel}>
        <View style={styles.sectionRow}>
          <View style={styles.audioStatusRow}>
            <View style={[styles.audioStatusDot, { backgroundColor: permissionTone }]} />
            <MaterialCommunityIcons name="headphones" size={18} color={theme.colors.text} />
          </View>
          <Pressable
            onPress={() => { requestAudioDeviceAccess(); }}
            style={styles.refreshButton}>
            <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.accent} />
          </Pressable>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLabelRow}>
            <MaterialCommunityIcons name="microphone" size={17} color={theme.colors.muted} />
            <Text style={styles.settingLabel}>Micrófono</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deviceList}>
            {audioInputDevices.map((device) => (
              <Pressable
                key={device.deviceId}
                onPress={() => setSelectedInputId(device.deviceId)}
                style={[
                  styles.deviceChip,
                  selectedInputId === device.deviceId && styles.deviceChipActive,
                ]}>
                <Text
                  style={[
                    styles.deviceChipText,
                    selectedInputId === device.deviceId && styles.deviceChipTextActive,
                  ]}>
                  {device.label || `Micrófono ${device.deviceId.slice(0, 5)}`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingLabelRow}>
            <MaterialCommunityIcons name="volume-high" size={17} color={theme.colors.muted} />
            <Text style={styles.settingLabel}>Salida</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deviceList}>
            {audioOutputDevices.map((device) => (
              <Pressable
                key={device.deviceId}
                onPress={() => setSelectedOutputId(device.deviceId)}
                style={[
                  styles.deviceChip,
                  selectedOutputId === device.deviceId && styles.deviceChipActive,
                ]}>
                <Text
                  style={[
                    styles.deviceChipText,
                    selectedOutputId === device.deviceId && styles.deviceChipTextActive,
                  ]}>
                  {device.label || `Altavoz ${device.deviceId.slice(0, 5)}`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    ) : null;

  return (
    <AppShell
      scroll={false}
      sectionKey="radio"
      contentContainerStyle={styles.container}
      header={
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title} numberOfLines={1}>
              {activeChannel?.title || 'Radio operativo'}
            </Text>
            <View style={styles.headerPills}>
              <StatusPill label={liveStatus.label} tone={liveStatus.tone} />
              <View style={styles.headerMiniChip}>
                <MaterialCommunityIcons name="server-network" size={14} color={theme.colors.muted} />
                <Text style={styles.headerMiniText} numberOfLines={1}>
                  {socketStatus || 'idle'}
                </Text>
              </View>
              <View style={styles.headerMiniChip}>
                <MaterialCommunityIcons name="account-group" size={14} color={theme.colors.muted} />
                <Text style={styles.headerMiniText} numberOfLines={1}>
                  {activeOperatorCount || '--'} ops
                </Text>
              </View>
            </View>
          </View>
          {Platform.OS === 'web' && (
            <View style={styles.headerControls}>
              <View style={styles.deviceCompactBar}>
                <Pressable
                  accessibilityLabel="Micrófono"
                  onHoverIn={Platform.OS === 'web' ? () => setShowSettings(true) : undefined}
                  onPress={() => setShowSettings(!showSettings)}
                  style={styles.deviceCompactChip}>
                  <MaterialCommunityIcons
                    name={audioPermissionState === 'denied' ? 'microphone-off' : 'microphone'}
                    size={16}
                    color={permissionTone}
                  />
                  <Text style={styles.deviceCompactText} numberOfLines={1}>{activeInputName}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Salida"
                  onHoverIn={Platform.OS === 'web' ? () => setShowSettings(true) : undefined}
                  onPress={() => setShowSettings(!showSettings)}
                  style={styles.deviceCompactChip}>
                  <MaterialCommunityIcons name="volume-high" size={16} color={theme.colors.info} />
                  <Text style={styles.deviceCompactText} numberOfLines={1}>{activeOutputName}</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => setShowSettings(!showSettings)}
                accessibilityLabel="Ajustes de audio"
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.line,
                  },
                ]}>
                <MaterialCommunityIcons
                  name={showSettings ? 'close' : 'tune'}
                  size={22}
                  color={theme.colors.text}
                />
              </Pressable>
            </View>
          )}
        </View>
      }>
      <View style={styles.pagerShell} onLayout={handlePagerLayout}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          bounces={false}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={handlePagerMomentumEnd}
          contentOffset={{ x: pageWidth * INITIAL_RADIO_PAGE_INDEX, y: 0 }}
          style={styles.pager}>
          <View style={[styles.page, { width: pageWidth }]}>
        <View style={styles.directoryPanel}>
          <View style={styles.searchShell}>
            <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.muted} />
            <TextInput
              {...getTextInputProps(theme, { autoComplete: 'off', returnKeyType: 'search' })}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar canal o contacto"
              placeholderTextColor={theme.colors.muted}
              style={styles.searchInput}
            />
          </View>

          <Pressable onPress={() => { handleOpenGeneralRadio(); }} style={styles.quickActionCard}>
            <View style={styles.quickActionLead}>
              <MaterialCommunityIcons name="radio-tower" size={20} color="#FFFFFF" />
              <Text style={styles.quickActionTitle}>Abrir radio general</Text>
            </View>
            <MaterialCommunityIcons name="radio-handheld" size={22} color="#FFFFFF" />
          </Pressable>

          <ScrollView
            style={styles.directoryScroll}
            contentContainerStyle={styles.directoryContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.sectionBlock}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Canales</Text>
                <StatusPill label={`${filteredChannels.length}`} tone="info" />
              </View>

              {filteredChannels.map((channel) => {
                const contact = getConversationContact(channel, user.id);
                const isActive = channel.id === activeChannel?.id;
                const connectedCount = channel.participants.length;
                const channelStatus = channel.unreadCount ? 'Nuevo audio' : 'En espera';

                return (
                  <Pressable
                    key={channel.id}
                    onHoverIn={Platform.OS === 'web' ? () => setHoveredRadioItemId(channel.id) : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setHoveredRadioItemId(null) : undefined}
                    onPress={() => { handleSelectChannel(channel.id); }}
                    style={[
                      styles.channelCard,
                      isActive ? styles.channelCardActive : undefined,
                      hoveredRadioItemId === channel.id ? styles.listCardHover : undefined,
                    ]}>
                    <View style={styles.channelRow}>
                      <View style={styles.channelAvatar}>
                        <MaterialCommunityIcons
                          name={channel.kind === 'group' ? 'radio-handheld' : 'radio'}
                          size={20}
                          color={isActive ? '#FFFFFF' : theme.colors.accent}
                        />
                      </View>
                      <View style={styles.channelCopy}>
                        <Text style={styles.channelTitle} numberOfLines={1}>{channel.title}</Text>
                        <Text style={styles.channelMeta} numberOfLines={1}>
                          {contact ? formatRole(contact.role) : 'Canal'}
                          {` - ${channelStatus}`}
                          {connectedCount ? ` - ${connectedCount} usuarios` : ''}
                        </Text>
                      </View>
                      <View style={styles.channelStatusDot} />
                      {channel.unreadCount ? (
                        <View style={styles.unreadBubble}>
                          <Text style={styles.unreadBubbleText}>{channel.unreadCount}</Text>
                        </View>
                      ) : null}
                      <View style={styles.channelActionIcon}>
                        <MaterialCommunityIcons name="radio" size={16} color={theme.colors.accent} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {filteredContacts.length ? (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Directo rápido</Text>
                <StatusPill label={`${filteredContacts.length}`} tone="info" />
              </View>

              {filteredContacts.map((contact) => (
                <Pressable
                  key={contact.id}
                  onHoverIn={Platform.OS === 'web' ? () => setHoveredRadioItemId(`contact-${contact.id}`) : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHoveredRadioItemId(null) : undefined}
                  onPress={() => { handleOpenDirectRadio(contact.id); }}
                  style={[
                    styles.contactRow,
                    hoveredRadioItemId === `contact-${contact.id}` ? styles.listCardHover : undefined,
                  ]}>
                  <View style={styles.contactLead}>
                    <UserAvatar user={contact} status={contact.status} showStatus size={42} />
                    <View style={styles.contactCopy}>
                      <Text style={styles.contactTitle}>{contact.name}</Text>
                    </View>
                  </View>
                  <View style={styles.contactActionButton}>
                    <MaterialCommunityIcons name="radio" size={18} color="#FFFFFF" />
                  </View>
                </Pressable>
              ))}
            </View>
            ) : null}
          </ScrollView>
        </View>

          </View>

          <View style={[styles.page, styles.radioPage, { width: pageWidth }]}>
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>Consola PTT</Text>
                <Text style={styles.heroTitle}>
                  {liveStatus.label}
                </Text>
              </View>
              <View style={styles.heroPills}>
                {Platform.OS === 'web' && isDesktop ? (
                  <View style={styles.heroDeviceBar}>
                    <Pressable
                      accessibilityLabel="Micrófono"
                      onHoverIn={() => setShowSettings(true)}
                      onPress={() => setShowSettings(!showSettings)}
                      style={styles.deviceCompactChip}>
                      <MaterialCommunityIcons
                        name={audioPermissionState === 'denied' ? 'microphone-off' : 'microphone'}
                        size={16}
                        color={permissionTone}
                      />
                      <Text style={styles.deviceCompactText} numberOfLines={1}>{activeInputName}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Salida"
                      onHoverIn={() => setShowSettings(true)}
                      onPress={() => setShowSettings(!showSettings)}
                      style={styles.deviceCompactChip}>
                      <MaterialCommunityIcons name="volume-high" size={16} color={theme.colors.info} />
                      <Text style={styles.deviceCompactText} numberOfLines={1}>{activeOutputName}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>

            {audioSettingsPanel}

            <View
              style={[
                styles.operationalBanner,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: liveStatusColor,
                },
              ]}>
              <View style={[styles.operationalIcon, { backgroundColor: liveStatusColor }]}>
                <MaterialCommunityIcons name={liveStatus.icon} size={19} color="#FFFFFF" />
              </View>
              <View style={styles.operationalCopy}>
                <Text style={styles.operationalTitle} numberOfLines={1}>
                  {liveStatus.detail}
                </Text>
                {radioActionText ? (
                  <Text style={styles.operationalAction} numberOfLines={1}>
                    {radioActionText}
                  </Text>
                ) : null}
              </View>
              <View style={styles.operationalSignal}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.signalBar,
                      {
                        height: 7 + index * 4,
                        backgroundColor: index < signalLevel ? liveStatusColor : theme.colors.line,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.pttCenter}>
              <Animated.View style={[styles.pttHalo, haloAnimatedStyle]} />
              <Animated.View style={[styles.pttOuter, pttAnimatedStyle]}>
                <Pressable
                  onPress={() => { handlePttPress(); }}
                  onPressIn={handlePttPressIn}
                  onPressOut={handlePttPressOut}
                  disabled={isPttDisabled}
                  style={[
                    styles.pttButton,
                    pttStateStyle,
                    isPttDisabled
                      ? styles.pttButtonDisabled
                      : undefined,
                  ]}>
                  {recordingState === 'uploading' ? (
                    <ActivityIndicator color="#FFFFFF" size="large" />
                  ) : (
                    <MaterialCommunityIcons name="microphone" size={isPhone ? 42 : 48} color="#FFFFFF" />
                  )}
                  <Text style={styles.pttButtonTitle}>
                    {recordingState === 'recording'
                      ? formatDuration(recordingSeconds)
                      : recordingState === 'uploading'
                        ? 'Enviando'
                        : recordingState === 'sent'
                          ? 'Enviado'
                          : recordingState === 'error'
                            ? 'Error'
                            : 'PTT'}
                  </Text>
                  <Text style={styles.pttButtonSubtitle}>
                    {recordingState === 'recording'
                      ? 'Suelta para enviar'
                      : isPttDisabled
                        ? pttDisabledText
                        : Platform.OS === 'web'
                          ? 'Toca para transmitir'
                          : 'Mantener o tocar'}
                  </Text>
                </Pressable>
              </Animated.View>
            </View>

            <View style={styles.waveRow}>
              {Array.from({ length: 18 }).map((_, index) => (
                <WaveBar
                  key={index}
                  active={recordingState === 'recording' || isReceivingLive}
                  theme={theme}
                  index={index}
                  volumeValue={volumeValue}
                />
              ))}
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons
                  name={liveStatus.icon}
                  size={18}
                  color={liveStatusColor}
                />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Fase</Text>
                  <Text style={styles.metricValue}>{radioPhase}</Text>
                </View>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="access-point" size={18} color={theme.colors.muted} />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Socket</Text>
                  <Text style={styles.metricValue}>{socketStatus || 'idle'}</Text>
                </View>
                <View style={styles.signalBars}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.signalBar,
                        {
                          height: 7 + index * 4,
                          backgroundColor:
                            index < signalLevel ? liveStatusColor : theme.colors.line,
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="timer-outline" size={18} color={theme.colors.muted} />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Duracion</Text>
                  <Text style={styles.metricValue}>
                    {recordingState === 'recording'
                      ? formatDuration(recordingSeconds)
                      : `max ${formatDuration(MAX_RADIO_NOTE_SECONDS)}`}
                  </Text>
                </View>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={18} color={theme.colors.muted} />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Operacion</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>
                    {radioMetrics.sent} env / {radioMetrics.received} rec
                  </Text>
                </View>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="cloud-clock-outline" size={18} color={theme.colors.muted} />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Subida media</Text>
                  <Text style={styles.metricValue}>{averageUploadMs ? `${averageUploadMs} ms` : '--'}</Text>
                </View>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="play-circle-outline" size={18} color={theme.colors.muted} />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Playback medio</Text>
                  <Text style={styles.metricValue}>{averagePlaybackMs ? `${averagePlaybackMs} ms` : '--'}</Text>
                </View>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="history" size={18} color={theme.colors.muted} />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Ultima</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>
                    {loadedVoiceNotes[0]
                      ? formatRelativeTime(loadedVoiceNotes[0].message.createdAt)
                      : 'Sin actividad'}
                  </Text>
                </View>
              </View>
            </View>

            {recentActivity.length ? (
              <View style={styles.compactActivityPanel}>
                <View style={styles.compactActivityHeader}>
                  <Text style={styles.compactActivityTitle}>Ultimas transmisiones</Text>
                  <Text style={styles.compactActivityMeta}>{filteredVoiceNotes.length} audios</Text>
                </View>
                {recentActivity.map((item) => (
                  <View key={item.id} style={styles.compactActivityRow}>
                    <View style={styles.compactActivityDot} />
                    <View style={styles.compactActivityCopy}>
                      <Text style={styles.compactActivityName} numberOfLines={1}>
                        {item.message.sender?.name || 'Operacion'}
                      </Text>
                      <Text style={styles.compactActivityTime} numberOfLines={1}>
                        {formatDuration(Number(item.message.durationSeconds || 0))} - {formatRelativeTime(item.message.createdAt)}
                      </Text>
                    </View>
                    <Text style={styles.compactActivityStatus}>
                      {item.message.senderId === user.id ? 'TX' : 'RX'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          </View>

          <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.historyPanel}>
            <View style={styles.audioPageHeader}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Actividad / Audios</Text>
                <StatusPill label={`${filteredVoiceNotes.length}`} tone="info" />
              </View>

              {availableAudioFilters.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}>
                  {availableAudioFilters.map((filter) => (
                    <Pressable
                      key={filter.key}
                      onPress={() => setAudioFilter(filter.key)}
                      style={[
                        styles.filterChip,
                        audioFilter === filter.key ? styles.filterChipActive : undefined,
                      ]}>
                      <Text
                        style={[
                          styles.filterChipText,
                          audioFilter === filter.key ? styles.filterChipTextActive : undefined,
                        ]}>
                        {filter.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            <FlatList
              data={filteredVoiceNotes}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.historyContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <VoiceTransmissionCard
                  message={item.message}
                  channelTitle={item.channelTitle}
                  isActive={activePlaybackMessageId === item.message.id}
                  token={token}
                  theme={theme}
                  onPlaybackChange={handleVoicePlaybackChange}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconShell}>
                    <MaterialCommunityIcons name="radio-handheld" size={28} color={theme.colors.muted} />
                  </View>
                  <View style={styles.emptyWaveRow}>
                    {Array.from({ length: 9 }).map((_, index) => (
                      <View key={index} style={[styles.emptyWaveBar, { height: 8 + (index % 4) * 4 }]} />
                    ))}
                  </View>
                  <Text style={styles.emptyTitle}>En espera</Text>
                  <Text style={styles.emptyText}>Las transmisiones apareceran cuando haya audios cargados.</Text>
                </View>
              }
            />
          </View>
          </View>
        </ScrollView>
      </View>

      <View style={styles.pageIndicators}>
        {RADIO_PAGES.map((label, index) => (
          <Pressable
            key={label}
            accessibilityLabel={`Ir a ${label}`}
            onPress={() => goToPage(index as RadioPageIndex)}
            style={styles.pageIndicatorHit}>
            <View
              style={[
                styles.pageIndicator,
                activePageIndex === index ? styles.pageIndicatorActive : undefined,
              ]}
            />
          </Pressable>
        ))}
      </View>
    </AppShell>
  );
}

function WaveBar({
  active,
  theme,
  index,
  volumeValue,
}: {
  active: boolean;
  theme: ReturnType<typeof useAppTheme>['theme'];
  index: number;
  volumeValue: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const vol = volumeValue.value;
    const phase = 1 + Math.sin(index * 0.74) * 0.32;
    const idleHeight = 7 + (index % 5) * 1.7;
    const targetHeight = active ? idleHeight + vol * 48 * phase : idleHeight;

    return {
      height: withSpring(targetHeight, {
        damping: 15,
        stiffness: 120,
        mass: 0.8,
      }),
      backgroundColor: active ? theme.colors.accent : theme.colors.line,
      opacity: active ? 0.4 + vol * 0.6 : 0.3,
    };
  });

  return <Animated.View style={[WAVE_BAR_BASE_STYLE, animatedStyle]} />;
}
