import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import {
  getAudioPlaybackErrorMessage,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  stopActiveAudioPlaybackAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from '@/src/native/audio';
import * as Haptics from '@/src/native/haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { AppTheme, Typography } from '@/constants/theme';
import { getAuthHeaderSnapshot, resolveAssetUrl } from '@/src/api/client';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { ChatDirectoryContact, ChatMessage, ConversationSummary } from '@/src/types/app';
import { formatRelativeTime, formatRole } from '@/src/utils/format';
import { getRadioConnectionStatus } from '@/src/utils/radio-status';
import { getTextInputProps } from '@/src/utils/text-input-props';

type RecordingState = 'idle' | 'recording' | 'uploading' | 'sent' | 'error';
type AudioPermissionState = 'unknown' | 'granted' | 'denied';
type AudioFilter = 'all' | 'current' | 'mine';
type RadioPageIndex = 0 | 1 | 2;
type VoicePlaybackPhase =
  | 'IDLE'
  | 'LOADING'
  | 'BUFFERING'
  | 'PLAYING'
  | 'PAUSED'
  | 'FINISHED'
  | 'ERROR';
type VoicePlaybackChangeMeta = {
  audioId?: string | null;
  reason: string;
  uri?: string | null;
};
type ActivePlaybackState = {
  messageId: string;
  phase: Extract<VoicePlaybackPhase, 'LOADING' | 'BUFFERING' | 'PLAYING'>;
  updatedAt: number;
} | null;

const MIN_RADIO_NOTE_SECONDS = 1;
const MAX_RADIO_NOTE_SECONDS = 60;
const INITIAL_RADIO_PAGE_INDEX: RadioPageIndex = 1;
const RADIO_PAGES = ['Canales', 'Radio', 'Audios'] as const;

async function withRadioTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getConversationContact(conversation: ConversationSummary, currentUserId?: string | null) {
  return (
    conversation.participants.find((participant) => participant.id !== currentUserId) ||
    conversation.participants[0] ||
    null
  );
}

function getConversationPreview(conversation: ConversationSummary) {
  if (!conversation.lastMessage) {
    return 'Listo para transmitir.';
  }

  return (
    conversation.lastMessage.transcript ||
    conversation.lastMessage.textPreview ||
    conversation.lastMessage.text ||
    'Audio operativo reciente'
  );
}

function getContactSearchText(contact: ChatDirectoryContact) {
  return `${contact.name} ${contact.email} ${contact.phone} ${contact.role}`.toLowerCase();
}

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getDeviceDisplayName(
  devices: MediaDeviceInfo[],
  selectedId: string,
  fallback: string
) {
  const selected =
    devices.find((device) => device.deviceId === selectedId) ||
    devices.find((device) => device.deviceId === 'default') ||
    devices[0];

  if (!selected?.label) {
    return fallback;
  }

  return selected.label.replace(/\s*\([^)]*\)\s*$/, '').trim() || fallback;
}

function getFirstName(name?: string | null) {
  return String(name || '').trim().split(/\s+/)[0] || null;
}

function isLivePlaybackPhase(phase?: VoicePlaybackPhase | null) {
  return phase === 'LOADING' || phase === 'BUFFERING' || phase === 'PLAYING';
}

function isDevelopmentRuntime() {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
}

function logRadioDevelopmentEvent(scope: 'radio-state' | 'radio-player', event: Record<string, unknown>) {
  if (!isDevelopmentRuntime()) {
    return;
  }

  console.info(`[${scope}]`, {
    ...event,
    timestamp: new Date().toISOString(),
  });
}

function getVoiceWaveformBars(message: ChatMessage, barCount = 18) {
  const seedText = `${message.id}:${message.durationSeconds || 0}:${message.createdAt}`;
  let seed = 0;

  for (let index = 0; index < seedText.length; index += 1) {
    seed = (seed * 31 + seedText.charCodeAt(index)) % 9973;
  }

  return Array.from({ length: barCount }, (_, index) => {
    const wave = Math.sin((seed + index * 19) * 0.37);
    const secondary = Math.cos((seed + index * 11) * 0.21);
    const envelope = 0.42 + Math.sin((index / Math.max(1, barCount - 1)) * Math.PI) * 0.58;
    return 7 + Math.round((10 + wave * 5 + secondary * 3) * envelope);
  });
}

function normalizeMeteringDecibels(metering?: number) {
  if (typeof metering !== 'number' || Number.isNaN(metering)) {
    return 0;
  }

  return clampVolume((metering + 62) / 52);
}

function getTimeDomainVolume(samples: Uint8Array) {
  if (!samples.length) {
    return 0;
  }

  let sumSquares = 0;
  let peak = 0;

  samples.forEach((sample) => {
    const centered = (sample - 128) / 128;
    const absolute = Math.abs(centered);
    sumSquares += centered * centered;
    peak = Math.max(peak, absolute);
  });

  const rms = Math.sqrt(sumSquares / samples.length);
  const gatedRms = Math.max(0, rms - 0.012);
  return clampVolume(gatedRms / 0.16 + peak * 0.24);
}

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

  const pagerRef = useRef<ScrollView>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedAtRef = useRef<number | null>(null);
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
  const autoPlayedVoiceNoteIdsRef = useRef<Set<string>>(new Set());
  const meteringFrameRef = useRef<number | null>(null);
  const meteringCleanupRef = useRef<(() => void) | null>(null);
  const meteringActiveRef = useRef(false);
  const recordingStateRef = useRef<RecordingState>('idle');
  const pulseValue = useSharedValue(1);
  const haloValue = useSharedValue(0);
  const volumeValue = useSharedValue(0);

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
  const receivingVoiceNote = useMemo(
    () =>
      activePlaybackMessageId
        ? loadedVoiceNotes.find((item) => item.message.id === activePlaybackMessageId)?.message ||
          null
        : null,
    [activePlaybackMessageId, loadedVoiceNotes]
  );
  const latestIncomingActiveVoiceNote = useMemo(
    () =>
      activeChannel
        ? loadedVoiceNotes.find(
            (item) =>
              item.channelId === activeChannel.id &&
              item.message.senderId !== user?.id &&
              Boolean(item.message.audioUrl) &&
              !autoPlayedVoiceNoteIdsRef.current.has(item.message.id)
          ) || null
        : null,
    [activeChannel, loadedVoiceNotes, user?.id]
  );
  const receivingSenderName = receivingVoiceNote?.sender?.name || null;
  const receivingSenderShortName = getFirstName(receivingSenderName);

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
  const isRadioReceiving = Boolean(activePlayback && isLivePlaybackPhase(activePlayback.phase));
  const radioConnection = useMemo(
    () =>
      getRadioConnectionStatus(socketStatus, {
        hasUser: Boolean(user),
        isReceiving: isRadioReceiving,
        isTransmitting: isRadioTransmitting,
        networkStatus,
        pendingSyncCount,
        radioChannelReady: Boolean(activeChannel),
      }),
    [
      activeChannel,
      isRadioReceiving,
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
      ? 'Mic bloqueado'
      : isBusy
        ? 'Transmision en curso'
        : !activeChannel
          ? 'Sin canal activo'
          : isRadioReceiving
            ? 'Recibiendo audio'
            : !radioConnection.canTransmit
              ? radioConnection.detail
              : null;
  const isPttDisabled =
    !supportsTapToTalk ||
    audioPermissionState === 'denied' ||
    isBusy ||
    !activeChannel ||
    isRadioReceiving ||
    (!radioConnection.canTransmit && recordingState !== 'recording');

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
        receiving: isRadioReceiving,
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
    isRadioReceiving,
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

  const setRecordingMode = useCallback((nextState: RecordingState) => {
    recordingStateRef.current = nextState;
    setRecordingState(nextState);
  }, []);

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
    setActivePlayback(null);
    stopActiveAudioPlaybackAsync().catch(() => undefined);
  }, [activeChannelId]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      if (pressToTalkTimerRef.current) {
        clearTimeout(pressToTalkTimerRef.current);
      }
      if (idleStatusTimerRef.current) {
        clearTimeout(idleStatusTimerRef.current);
      }

      stopWebMetering();
      nativeRecorder.stop().catch(() => undefined);
      stopActiveAudioPlaybackAsync().catch(() => undefined);
      setActivePlayback(null);
      webRecorderRef.current?.stop?.();
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
    };
  }, [nativeRecorder, stopWebMetering]);

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

      if (isLivePlaybackPhase(phase)) {
        return {
          messageId,
          phase,
          updatedAt: Date.now(),
        };
      }

      return current?.messageId === messageId ? null : current;
    });
  }, []);

  const handleAutoPlaybackStart = useCallback((messageId: string) => {
    autoPlayedVoiceNoteIdsRef.current.add(messageId);
  }, []);

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

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });

    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    await withRadioTimeout(
      nativeRecorder.prepareToRecordAsync(),
      7000,
      'No se pudo iniciar el microfono a tiempo.'
    );
    nativeRecorder.record();
    startRecordingTicker();
    syncRecordingAnimation(true);
    setRecorderMessage('Grabando');
    setAudioPermissionState('granted');
    setRecordingMode('recording');
  };

  const stopNativeRecording = async () => {
    if (!activeChannel) {
      return;
    }

    setRecordingMode('uploading');
    await withRadioTimeout(
      nativeRecorder.stop(),
      7000,
      'No se pudo cerrar la grabacion a tiempo.'
    );
    const status = nativeRecorder.getStatus();
    const uri = status.url || nativeRecorder.uri;
    stopRecordingTicker();
    syncRecordingAnimation(false);

    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });

    if (!uri) {
      setRecorderMessage('Audio no disponible');
      setRecordingMode('error');
      scheduleIdleAfterStatus();
      return;
    }

    const rawDurationSeconds = Math.round(Number(status.durationMillis || 0) / 1000);

    if (rawDurationSeconds < MIN_RADIO_NOTE_SECONDS) {
      setRecorderMessage('Manten presionado al menos 1 segundo');
      setRecordingMode('error');
      scheduleIdleAfterStatus();
      return;
    }

    const durationSeconds = Math.min(MAX_RADIO_NOTE_SECONDS, rawDurationSeconds);

    const formData = new FormData();
    formData.append('channelId', activeChannel.id);
    formData.append('durationSeconds', String(durationSeconds));
    formData.append('createdAt', new Date().toISOString());
    if (user?.id) {
      formData.append('userId', user.id);
    }
    formData.append('file', {
      uri,
      name: `radio-note-${Date.now()}.m4a`,
      type: 'audio/mp4',
    } as any);

    const result = await withRadioTimeout(
      sendVoiceMessage(activeChannel.id, formData),
      50000,
      'Tiempo de espera agotado al enviar la transmision.'
    );
    if (!result.ok) {
      throw new Error(result.message || 'No fue posible enviar la transmision.');
    }
    setRecorderMessage('Enviado');
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
        setRecorderMessage('Manten presionado al menos 1 segundo');
        setRecordingMode('error');
        scheduleIdleAfterStatus();
        return;
      }

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
  const permissionTone =
    audioPermissionState === 'denied'
      ? theme.colors.warning
      : audioPermissionState === 'granted'
        ? theme.colors.success
        : theme.colors.muted;
  const liveStatus = (() => {
    if (recordingState === 'recording') {
      return {
        detail: 'Transmitiendo en el canal activo',
        icon: 'microphone' as const,
        label: 'Transmitiendo',
        tone: 'danger' as const,
      };
    }

    if (recordingState === 'uploading') {
      return {
        detail: 'Enviando audio al canal',
        icon: 'cloud-upload-outline' as const,
        label: 'Enviando',
        tone: 'info' as const,
      };
    }

    if (recordingState === 'sent') {
      return {
        detail: 'Transmision entregada',
        icon: 'check-circle-outline' as const,
        label: 'Enviado',
        tone: 'positive' as const,
      };
    }

    if (recordingState === 'error') {
      return {
        detail: recorderMessage || 'Revisa el audio e intenta de nuevo',
        icon: 'alert-circle-outline' as const,
        label: 'Error',
        tone: 'warning' as const,
      };
    }

    if (isRadioReceiving) {
      return {
        detail: receivingSenderShortName
          ? `Escuchando a ${receivingSenderShortName}`
          : 'Audio entrante activo',
        icon: 'volume-high' as const,
        label: receivingSenderShortName ? `${receivingSenderShortName} transmitiendo` : 'Recibiendo',
        tone: 'info' as const,
      };
    }

    if (!radioConnection.canTransmit) {
      return {
        detail: radioConnection.detail,
        icon: radioConnection.state === 'RECONNECTING' ? 'sync' as const : 'access-point-off' as const,
        label: radioConnection.label,
        tone: radioConnection.tone,
      };
    }

    return {
      detail: activeChannel?.title || 'Canal operativo listo',
      icon: 'check-circle-outline' as const,
      label: 'Conectado',
      tone: 'positive' as const,
    };
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
            <Text style={styles.title}>Radio operativo</Text>
            <View style={styles.headerPills}>
              <StatusPill label={liveStatus.label} tone={liveStatus.tone} />
              <Text style={styles.headerStatusText} numberOfLines={1}>{liveStatus.detail}</Text>
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
                <Text style={styles.heroEyebrow}>Canal activo</Text>
                <Text style={styles.heroTitle}>
                  {activeChannel?.title || 'Radio operativo'}
                </Text>
              </View>
              <View style={styles.heroPills}>
                <StatusPill
                  label={liveStatus.label}
                  tone={liveStatus.tone}
                />
                <Text style={styles.heroLiveDetail} numberOfLines={1}>{liveStatus.detail}</Text>
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
                    recordingState === 'recording'
                      ? styles.pttButtonRecording
                      : styles.pttButtonIdle,
                    isPttDisabled
                      ? styles.pttButtonDisabled
                      : undefined,
                  ]}>
                  {recordingState === 'uploading' ? (
                    <ActivityIndicator color="#FFFFFF" size="large" />
                  ) : (
                    <MaterialCommunityIcons name="microphone" size={58} color="#FFFFFF" />
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
                            : 'Tap to Talk'}
                  </Text>
                </Pressable>
              </Animated.View>
            </View>

            <View style={styles.waveRow}>
              {Array.from({ length: 18 }).map((_, index) => (
                <WaveBar
                  key={index}
                  active={recordingState === 'recording'}
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
                  <Text style={styles.metricLabel}>Estado</Text>
                  <Text style={styles.metricValue}>{liveStatus.label}</Text>
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
                <MaterialCommunityIcons name="microphone-outline" size={18} color={permissionTone} />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Dispositivo</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>{activeInputName}</Text>
                </View>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="radio-tower" size={18} color={theme.colors.muted} />
                <View style={styles.metricCopy}>
                  <Text style={styles.metricLabel}>Ultima transmision</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>
                    {loadedVoiceNotes[0]
                      ? formatRelativeTime(loadedVoiceNotes[0].message.createdAt)
                      : 'Sin actividad'}
                  </Text>
                </View>
              </View>
            </View>

            {recorderMessage || !radioConnection.canTransmit ? (
              <Text style={styles.heroNote}>{recorderMessage || liveStatus.detail}</Text>
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
                  autoPlay={latestIncomingActiveVoiceNote?.message.id === item.message.id}
                  isActive={activePlaybackMessageId === item.message.id}
                  token={token}
                  theme={theme}
                  onAutoPlaybackStart={handleAutoPlaybackStart}
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

  return <Animated.View style={[styles.waveBar, animatedStyle]} />;
}

function VoiceTransmissionCard({
  autoPlay,
  channelTitle,
  isActive,
  message,
  onAutoPlaybackStart,
  onPlaybackChange,
  token,
  theme,
}: {
  autoPlay?: boolean;
  channelTitle?: string;
  isActive?: boolean;
  message: ChatMessage;
  onAutoPlaybackStart?: (messageId: string) => void;
  onPlaybackChange?: (
    messageId: string,
    phase: VoicePlaybackPhase,
    meta?: VoicePlaybackChangeMeta
  ) => void;
  token: string | null;
  theme: ReturnType<typeof useAppTheme>['theme'];
  outputDeviceId?: string;
}) {
  const resolvedUrl = resolveAssetUrl(message.audioUrl);
  const player = useAudioPlayer(
    resolvedUrl
      ? {
          uri: resolvedUrl,
          getHeaders: () => getAuthHeaderSnapshot(token),
        }
      : null
  );
  const playerStatus = useAudioPlayerStatus(player);
  const playerStatusRef = useRef(playerStatus);
  const playbackGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackPhaseRef = useRef<VoicePlaybackPhase>('IDLE');
  const playbackStartedAtRef = useRef<number | null>(null);
  const playbackOperationRef = useRef(0);
  const isPlaying = Boolean(playerStatus.playing);
  const isBuffering = Boolean(playerStatus.isBuffering);
  const fallbackDurationSeconds = Math.max(0, Number(message.durationSeconds || 0));
  const durationSeconds = Math.max(
    fallbackDurationSeconds,
    Number(playerStatus.duration || 0),
    Number(playerStatus.durationMillis || 0) / 1000
  );
  const currentSeconds = Math.min(
    durationSeconds || Number(playerStatus.currentTime || 0),
    Math.max(
      0,
      Number(playerStatus.currentTime || 0) ||
        Number(playerStatus.currentMillis || 0) / 1000
    )
  );
  const progress = durationSeconds > 0 ? clampVolume(currentSeconds / durationSeconds) : 0;
  const showProgress = durationSeconds > 0 && (isActive || isPlaying || playerStatus.isLoaded);
  const isPlaybackActive = isPlaying || isBuffering;
  const hasReachedEnd =
    durationSeconds > 0 && currentSeconds >= Math.max(0, durationSeconds - 0.25);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const waveformBars = useMemo(
    () => getVoiceWaveformBars(message),
    [message]
  );
  const cardActive = Boolean(isActive || isPlaybackActive);
  const playbackPhase: VoicePlaybackPhase = playbackError
    ? 'ERROR'
    : isBuffering
      ? 'BUFFERING'
      : isPlaying
        ? 'PLAYING'
        : hasReachedEnd
          ? 'FINISHED'
          : playerStatus.isLoaded && currentSeconds > 0
            ? 'PAUSED'
            : 'IDLE';
  const playbackStateLabel = playbackError
    ? 'Error de audio'
    : isBuffering
      ? 'Cargando'
      : isPlaying
        ? 'Reproduciendo'
        : hasReachedEnd
          ? 'Reproducido'
          : playerStatus.isLoaded && currentSeconds > 0
          ? 'Pausado'
          : resolvedUrl
            ? 'Listo'
            : 'Sin audio';

  useEffect(() => {
    playerStatusRef.current = playerStatus;
  }, [playerStatus]);

  useEffect(() => {
    setPlaybackError(null);
    playbackPhaseRef.current = 'IDLE';
  }, [resolvedUrl]);

  const transitionPlayback = useCallback(
    (nextPhase: VoicePlaybackPhase, reason: string, error?: unknown) => {
      const previousPhase = playbackPhaseRef.current;

      if (previousPhase === nextPhase) {
        return false;
      }

      playbackPhaseRef.current = nextPhase;
      const elapsedMs = playbackStartedAtRef.current ? Date.now() - playbackStartedAtRef.current : 0;

      if (nextPhase === 'LOADING' || nextPhase === 'BUFFERING' || nextPhase === 'PLAYING') {
        playbackStartedAtRef.current = playbackStartedAtRef.current || Date.now();
      }

      if (nextPhase === 'IDLE' || nextPhase === 'FINISHED' || nextPhase === 'ERROR') {
        playbackStartedAtRef.current = null;
      }

      const nativeError = error as (Error & { code?: string }) | undefined;

      logRadioDevelopmentEvent('radio-player', {
        audioId: message.audioUrl || null,
        elapsedMs,
        errorCode: nativeError?.code,
        errorMessage: nativeError?.message,
        errorName: nativeError?.name,
        event: reason,
        messageId: message.id,
        next: nextPhase,
        previous: previousPhase,
        stack: nativeError?.stack,
        uri: resolvedUrl,
      });
      onPlaybackChange?.(message.id, nextPhase, {
        audioId: message.audioUrl || null,
        reason,
        uri: resolvedUrl,
      });

      return true;
    },
    [message.audioUrl, message.id, onPlaybackChange, resolvedUrl]
  );

  useEffect(() => {
    transitionPlayback(playbackPhase, 'STATUS');
  }, [playbackPhase, transitionPlayback]);

  useEffect(
    () => () => {
      if (playbackGuardTimerRef.current) {
        clearTimeout(playbackGuardTimerRef.current);
      }
      playbackOperationRef.current += 1;
      transitionPlayback('IDLE', 'UNMOUNT');
    },
    [transitionPlayback]
  );

  const playTransmission = useCallback(
    async (source: 'manual' | 'auto') => {
      if (!resolvedUrl) {
        setPlaybackError('URL de audio invalida.');
        transitionPlayback('ERROR', 'ERROR', new Error('URL de audio invalida.'));
        return;
      }

      if (isPlaying || isBuffering) {
        return;
      }

      try {
        const operationId = playbackOperationRef.current + 1;
        playbackOperationRef.current = operationId;
        playbackStartedAtRef.current = Date.now();
        setPlaybackError(null);
        await stopActiveAudioPlaybackAsync().catch(() => undefined);
        transitionPlayback('LOADING', source === 'auto' ? 'AUTO_LOAD' : 'LOAD');

        if (source === 'auto') {
          onAutoPlaybackStart?.(message.id);
        }

        await player.play();
        if (playbackOperationRef.current !== operationId) {
          return;
        }

        if (playbackGuardTimerRef.current) {
          clearTimeout(playbackGuardTimerRef.current);
        }
        playbackGuardTimerRef.current = setTimeout(() => {
          if (playbackOperationRef.current !== operationId) {
            return;
          }

          const latestStatus = playerStatusRef.current;

          if (!latestStatus.playing && !latestStatus.isBuffering) {
            transitionPlayback('IDLE', 'GUARD_IDLE');
          }
        }, 1200);
      } catch (error) {
        const playbackMessage = getAudioPlaybackErrorMessage(error);
        const nativeError = error as Error & { code?: string };
        console.warn('[radio] playback failed', {
          audioId: message.audioUrl || null,
          elapsedMs: playbackStartedAtRef.current ? Date.now() - playbackStartedAtRef.current : 0,
          errorCode: nativeError?.code,
          errorMessage: nativeError?.message,
          errorName: nativeError?.name,
          messageId: message.id,
          next: 'ERROR',
          playbackMessage,
          previous: playbackPhaseRef.current,
          stack: nativeError?.stack,
          uri: resolvedUrl,
        });
        transitionPlayback('ERROR', 'ERROR', error);
        setPlaybackError(playbackMessage);
      }
    },
    [
      isBuffering,
      isPlaying,
      message.audioUrl,
      message.id,
      onAutoPlaybackStart,
      player,
      resolvedUrl,
      transitionPlayback,
    ]
  );

  useEffect(() => {
    if (!autoPlay) {
      return;
    }

    playTransmission('auto');
  }, [autoPlay, playTransmission]);

  const handleTogglePlayback = async () => {
    if (!resolvedUrl) {
      setPlaybackError('URL de audio invalida.');
      transitionPlayback('ERROR', 'ERROR', new Error('URL de audio invalida.'));
      return;
    }

    if (isPlaying) {
      await player.pause();
      transitionPlayback('PAUSED', 'PAUSE');
      return;
    }

    await playTransmission('manual');
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isPlaying ? 'Pausar' : 'Reproducir'} audio de radio`}
      onPress={handleTogglePlayback}
      style={[
        styles.voiceCard,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: cardActive ? theme.colors.accent : theme.colors.line,
          ...(Platform.OS === 'web' && cardActive
            ? { boxShadow: `0px 0px 18px ${theme.colors.accentSoft}` }
            : {}),
        },
      ]}>
      <View style={styles.voiceCardHeader}>
        <View style={styles.voiceCardLead}>
          <UserAvatar user={message.sender} status={message.sender?.status} size={36} />
          <View style={styles.voiceCardCopy}>
            <Text style={[styles.voiceCardName, { color: theme.colors.text }]}>
              {message.sender?.name || 'Operación'}
            </Text>
            <Text style={[styles.voiceCardTime, { color: theme.colors.muted }]}>
              {channelTitle ? `${channelTitle} - ` : ''}
              {formatRelativeTime(message.createdAt)}
            </Text>
          </View>
        </View>
        <View style={styles.voiceMetaPill}>
          <MaterialCommunityIcons
            name={isBuffering ? 'progress-clock' : 'clock-outline'}
            size={13}
            color={cardActive ? theme.colors.accent : theme.colors.muted}
          />
          <Text style={[styles.voiceMetaText, { color: theme.colors.muted }]}>
            {showProgress
              ? `${formatDuration(currentSeconds)} / ${formatDuration(durationSeconds)}`
              : formatDuration(fallbackDurationSeconds)}
          </Text>
        </View>
        <View
          style={[
            styles.voicePlayShell,
            {
              backgroundColor: cardActive ? theme.colors.accent : theme.colors.surface,
              borderColor: cardActive ? theme.colors.accent : theme.colors.line,
            },
          ]}>
          {isBuffering ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <MaterialCommunityIcons
              name={isPlaying ? 'pause' : 'play'}
              size={18}
              color={cardActive ? '#FFFFFF' : theme.colors.text}
            />
          )}
        </View>
      </View>

      <View style={styles.voiceWaveRow}>
        {waveformBars.map((height, index) => {
          const isBarPassed = progress > 0 && index / waveformBars.length <= progress;
          const voiceWaveBarStyle = {
            height,
            backgroundColor:
              cardActive || isBarPassed ? theme.colors.accent : theme.colors.line,
          };

          return (
            <View
              key={index}
              style={[
                styles.voiceWaveBar,
                voiceWaveBarStyle,
                cardActive || isBarPassed
                  ? styles.voiceWaveBarPlaying
                  : styles.voiceWaveBarIdle,
              ]}
            />
          );
        })}
      </View>

      <View style={styles.voiceStatusRow}>
        <View
          style={[
            styles.voiceStatusDot,
            {
              backgroundColor: playbackError
                ? theme.colors.warning
                : cardActive
                  ? theme.colors.accent
                  : theme.colors.muted,
            },
          ]}
        />
        <Text
          style={[
            styles.voiceStatusText,
            {
              color: playbackError
                ? theme.colors.warning
                : cardActive
                  ? theme.colors.accent
                  : theme.colors.muted,
            },
          ]}>
          {playbackStateLabel}
        </Text>
      </View>

      {playbackError ? (
        <Text style={[styles.voiceErrorText, { color: theme.colors.warning }]}>
          {playbackError}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  waveBar: {
    width: 8,
    borderRadius: 999,
  },
  voiceCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  voiceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  voiceCardLead: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceCardCopy: {
    flex: 1,
    gap: 2,
  },
  voiceCardName: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  voiceCardTime: {
    fontFamily: Typography.body,
    fontSize: 12,
  },
  voicePlayShell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceMetaPill: {
    height: 28,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  voiceMetaText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  voiceWaveRow: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  voiceWaveBar: {
    width: 4,
    borderRadius: 999,
  },
  voiceWaveBarPlaying: {
    opacity: 0.75,
  },
  voiceWaveBarIdle: {
    opacity: 0.34,
  },
  voiceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  voiceStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  voiceStatusText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  voiceErrorText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
  },
});

function createStyles(
  theme: ReturnType<typeof useAppTheme>['theme'],
  isDesktop: boolean,
  isPhone: boolean,
  isWideRadioLayout: boolean
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      minHeight: 0,
      gap: 10,
      backgroundColor: theme.colors.background,
    },
    pagerShell: {
      flex: 1,
      minHeight: 0,
      width: '100%',
    },
    pager: {
      flex: 1,
    },
    page: {
      flex: 1,
      minHeight: 0,
      paddingRight: isPhone ? 0 : 2,
    },
    radioPage: {
      justifyContent: 'space-between',
    },
    pageIndicators: {
      minHeight: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingTop: 4,
    },
    pageIndicatorHit: {
      minWidth: 22,
      minHeight: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pageIndicator: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: theme.colors.line,
      opacity: 0.72,
    },
    pageIndicatorActive: {
      width: 22,
      backgroundColor: theme.colors.accent,
      opacity: 1,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      paddingTop: 8,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
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
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    headerStatusText: {
      flexShrink: 1,
      minWidth: 0,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '700',
    },
    headerControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    },
    deviceCompactBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: isPhone ? 180 : 340,
    },
    deviceCompactChip: {
      minHeight: 40,
      maxWidth: isPhone ? 82 : 152,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
    },
    deviceCompactText: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
    },
    iconButton: {
      width: 48,
      height: 48,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingsPanel: {
      alignSelf: 'stretch',
      width: '100%',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: isPhone ? 12 : 14,
      gap: 12,
      marginBottom: 0,
    },
    settingItem: {
      gap: 8,
    },
    settingLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    settingLabel: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    audioStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    audioStatusDot: {
      width: 9,
      height: 9,
      borderRadius: 999,
    },
    deviceList: {
      flexDirection: 'row',
    },
    deviceChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.line,
      marginRight: 8,
    },
    deviceChipActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    deviceChipText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
    },
    deviceChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    refreshButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      width: 34,
      height: 34,
      borderRadius: 12,
    },
    refreshButtonText: {
      color: theme.colors.accent,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '700',
    },
    layout: {
      flex: 1,
      flexDirection: isWideRadioLayout ? 'row' : 'column',
      gap: AppTheme.spacing.md,
      alignItems: 'stretch',
      minHeight: isDesktop ? 760 : undefined,
    },
    directoryPanel: {
      flex: 1,
      width: '100%',
      minWidth: 0,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: isPhone ? 14 : 16,
      gap: 12,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 10px 20px rgba(4, 16, 27, 0.08)',
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 4,
          }),
      maxHeight: undefined,
    },
    searchShell: {
      minHeight: 52,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
    },
    quickActionCard: {
      minHeight: 56,
      borderRadius: 18,
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    quickActionLead: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    quickActionTitle: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '800',
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
      gap: 10,
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
    channelCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 10,
      gap: 0,
    },
    channelCardActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    listCardHover: {
      transform: [{ translateY: -1 }],
      ...(Platform.OS === 'web'
        ? {
            boxShadow: `0px 10px 24px ${theme.colors.shadow}`,
          }
        : {
            elevation: 5,
          }),
    },
    channelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    channelAvatar: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: theme.colors.line,
    },
    channelCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    channelTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '800',
    },
    channelMeta: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 16,
    },
    channelStatusDot: {
      width: 9,
      height: 9,
      borderRadius: 999,
      backgroundColor: theme.colors.success,
    },
    channelActionIcon: {
      width: 32,
      height: 32,
      borderRadius: 12,
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
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    contactLead: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    contactCopy: {
      flex: 1,
      minWidth: 0,
      gap: 0,
    },
    contactTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
    },
    contactMeta: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
    },
    contactActionButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    stagePanel: {
      flex: 1,
      flexDirection: isWideRadioLayout ? 'row' : 'column',
      minWidth: 0,
      width: '100%',
      gap: AppTheme.spacing.md,
    },
    heroCard: {
      flex: 1,
      minWidth: 0,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      justifyContent: 'space-between',
      padding: isPhone ? 14 : 18,
      gap: isPhone ? 10 : 12,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 16px 34px rgba(4, 16, 27, 0.12)',
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.12,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 6,
          }),
    },
    heroTopRow: {
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      gap: 12,
    },
    heroCopy: {
      flex: 1,
      width: '100%',
      minWidth: 0,
      gap: 6,
    },
    heroEyebrow: {
      color: theme.colors.accent,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 28 : 34,
      lineHeight: isPhone ? 34 : 40,
    },
    heroDescription: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 22,
      maxWidth: 720,
    },
    heroPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
    },
    heroLiveDetail: {
      flexShrink: 1,
      minWidth: 0,
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 22,
      paddingVertical: 3,
    },
    heroDeviceBar: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      gap: 8,
    },
    pttCenter: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: isPhone ? 238 : 270,
    },
    pttHalo: {
      position: 'absolute',
      width: isPhone ? 210 : 250,
      height: isPhone ? 210 : 250,
      borderRadius: 999,
      backgroundColor: theme.colors.accentSoft,
    },
    pttOuter: {
      width: isPhone ? 214 : 236,
      height: isPhone ? 214 : 236,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.02)',
      padding: 12,
    },
    pttButton: {
      width: '100%',
      height: '100%',
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    pttButtonIdle: {
      backgroundColor: theme.colors.accent,
      opacity: 0.92,
    },
    pttButtonRecording: {
      backgroundColor: theme.colors.danger,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: `0px 0px 32px ${theme.colors.dangerSoft}`,
          }
        : {
            elevation: 10,
          }),
    },
    pttButtonDisabled: {
      opacity: 0.45,
    },
    pttButtonTitle: {
      color: '#FFFFFF',
      fontFamily: Typography.display,
      fontSize: 24,
      fontWeight: '900',
    },
    pttButtonSubtitle: {
      color: 'rgba(255,255,255,0.78)',
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    waveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 52,
    },
    metricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    metricCard: {
      flexGrow: 1,
      flexBasis: isPhone ? '47%' : '23%',
      minWidth: isPhone ? 132 : 148,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    metricCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    metricLabel: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
    },
    metricValue: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 14,
      lineHeight: 18,
    },
    heroNote: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 20,
    },
    historyPanel: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
      borderRadius: isDesktop ? 28 : 30,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: isPhone ? 14 : 18,
      gap: 12,
      ...(Platform.OS === 'web'
        ? {
            boxShadow: '0px 10px 20px rgba(4, 16, 27, 0.08)',
          }
        : {
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 4,
          }),
    },
    historyScroll: {
      flex: 1,
      minHeight: 0,
    },
    historyContent: {
      gap: 10,
      paddingBottom: 16,
    },
    audioPageHeader: {
      gap: 10,
    },
    filterRow: {
      gap: 8,
      paddingRight: 4,
    },
    filterChip: {
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    filterChipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    filterChipText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
    },
    filterChipTextActive: {
      color: theme.colors.accent,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 44,
      paddingHorizontal: 18,
    },
    emptyIconShell: {
      width: 64,
      height: 64,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyWaveRow: {
      height: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    emptyWaveBar: {
      width: 5,
      borderRadius: 999,
      backgroundColor: theme.colors.line,
      opacity: 0.6,
    },
    emptyTitle: {
      color: theme.colors.muted,
      fontFamily: Typography.display,
      fontSize: 18,
      textAlign: 'center',
    },
    emptyText: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 340,
    },
  });
}
