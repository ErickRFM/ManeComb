import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import {
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
} from '@/src/native/audio';
import * as Haptics from '@/src/native/haptics';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DesignSystem } from '@/constants/theme';
import { useShallow } from 'zustand/react/shallow';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { getSharedRealtimeSocket } from '@/src/store/use-app-store';
import { formatRelativeTime } from '@/src/utils/format';
import { createStyles } from './radio-screen.styles';
import { PttAudioWave } from './components/ptt-audio-wave';
import { RadioAudiosPage } from './components/radio-audios-page';
import { RadioDirectoryPage } from './components/radio-directory-page';
import {
  initialRadioSessionState,
  radioSessionReducer,
  type RadioSessionAction,
} from './reducers/radio-session-reducer';
import {
  INITIAL_RADIO_PAGE_INDEX,
  MAX_RADIO_NOTE_SECONDS,
  MIN_RADIO_NOTE_SECONDS,
  RADIO_PAGES,
} from './constants';
import { getDeviceDisplayName, getTimeDomainVolume, withRadioTimeout } from './services/radio-audio-service';
import { useRadioLifecycle } from './hooks/use-radio-lifecycle';
import {
  RadioRealtimeService,
} from './services/radio-realtime-service';
import type {
  AudioFilter,
  AudioPermissionState,
  RadioOperationalPhase,
  RadioPageIndex,
} from './types';
import {
  formatDuration,
  getContactSearchText,
  getConversationContact,
  getConversationPreview,
} from './utils/radio-format';
import { useLocalSearchParams } from '@/src/navigation/router';

const RADIO_MOTION = {
  duration: DesignSystem.motion.normal,
  easing: Easing.out(Easing.cubic),
};

export function RadioScreen() {
  const params = useLocalSearchParams<{ channelId?: string; mode?: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DesignSystem.breakpoints.compact;
  const isPhone = width < DesignSystem.breakpoints.phone;
  const { theme } = useAppTheme();
  const {
    activeConversationId,
    chatContacts,
    conversations,
    loadChatContacts,
    loadConversation,
    messagesByConversation,
    presenceByUser,
    socketStatus,
    openDirectConversation,
    openGeneralConversation,
    sendVoiceMessage,
    setActiveConversationId,
    token,
    user,
  } = useAppStore(
    useShallow((state) => ({
      activeConversationId: state.activeConversationId,
      chatContacts: state.chatContacts,
      conversations: state.conversations,
      loadChatContacts: state.loadChatContacts,
      loadConversation: state.loadConversation,
      messagesByConversation: state.messagesByConversation,
      presenceByUser: state.presenceByUser,
      socketStatus: state.socketStatus,
      openDirectConversation: state.openDirectConversation,
      openGeneralConversation: state.openGeneralConversation,
      sendVoiceMessage: state.sendVoiceMessage,
      setActiveConversationId: state.setActiveConversationId,
      token: state.token,
      user: state.user,
    }))
  );

  const styles = useMemo(
    () => createStyles(theme, isDesktop, isPhone),
    [theme, isDesktop, isPhone]
  );
  const [search, setSearch] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [radioSession, dispatchRadioSession] = useReducer(
    radioSessionReducer,
    initialRadioSessionState
  );
  const radioSessionRef = useRef(radioSession);

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

  const pagerRef = useRef<ScrollView>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedAtRef = useRef<number | null>(null);
  const uploadStartedAtRef = useRef<number | null>(null);
  const pressToTalkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressToTalkActiveRef = useRef(false);
  const pressToTalkTriggeredRef = useRef(false);
  const pttBusyRef = useRef(false);
  const pendingStopAfterStartRef = useRef(false);
  const messageStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRecordingStopRequestedRef = useRef(false);
  const webRecorderRef = useRef<any>(null);
  const webStreamRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const bootstrappedRef = useRef(false);
  const meteringFrameRef = useRef<number | null>(null);
  const meteringCleanupRef = useRef<(() => void) | null>(null);
  const meteringActiveRef = useRef(false);
  const realtimeServiceRef = useRef<RadioRealtimeService | null>(null);
  const previousChannelIdRef = useRef<string | null>(null);
  const previousRadioSocketStatusRef = useRef(socketStatus);
  const previousUserIdRef = useRef<string | null>(user?.id || null);
  const historyLoadInFlightRef = useRef<Set<string>>(new Set());
  const pulseValue = useSharedValue(1);
  const haloValue = useSharedValue(0);
  const waveformLevels = useSharedValue<number[]>(Array(18).fill(0));
  const pushWaveformLevel = useCallback((level: number) => {
    const normalized = Math.max(0, Math.min(1, level));
    waveformLevels.value = [...waveformLevels.value.slice(1), normalized];
  }, [waveformLevels]);
  const transitionSession = useCallback((action: Omit<RadioSessionAction, 'type'>) => {
    const next = radioSessionReducer(radioSessionRef.current, { type: 'TRANSITION', ...action });
    radioSessionRef.current = next;
    dispatchRadioSession({ type: 'TRANSITION', ...action });
  }, []);
  const recorderMessage = radioSession.message;
  const liveOperator = radioSession.operator;
  const setRecorderMessage = useCallback((message: string | null) => {
    transitionSession({ phase: radioSessionRef.current.phase, message });
  }, [transitionSession]);
  const radioChannels = useMemo(
    () => conversations.filter((conversation) => conversation.channelMode === 'radio'),
    [conversations]
  );
  const generalRadioChannel = useMemo(
    () => radioChannels.find((conversation) => conversation.kind === 'group') || null,
    [radioChannels]
  );
  const activeChannel =
    radioChannels.find((conversation) => conversation.id === activeConversationId) || null;
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
        .sort((left, right) => {
          const rightTimestamp = new Date(right.message.createdAt).getTime();
          const leftTimestamp = new Date(left.message.createdAt).getTime();
          const byDate =
            (Number.isFinite(rightTimestamp) ? rightTimestamp : 0) -
            (Number.isFinite(leftTimestamp) ? leftTimestamp : 0);
          return byDate || right.message.id.localeCompare(left.message.id);
        }),
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

  const ensureRadioHistoryLoaded = useCallback(async (channelId: string) => {
    if (!channelId) {
      return;
    }

    if (historyLoadInFlightRef.current.has(channelId)) {
      return;
    }

    if (messagesByConversation[channelId] !== undefined) {
      return;
    }

    historyLoadInFlightRef.current.add(channelId);
    try {
      await loadConversation(channelId);
    } finally {
      historyLoadInFlightRef.current.delete(channelId);
    }
  }, [loadConversation, messagesByConversation]);

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
  const pttConnectionReady =
    ['READY', 'TRANSMITTING'].includes(radioSession.phase) && Boolean(activeChannel && user);
  const pttConnectionDetail =
    radioSession.phase === 'UNAUTHORIZED'
        ? 'Sesion expirada'
        : radioSession.phase === 'RECONNECTING' || radioSession.phase === 'CONNECTING' || radioSession.phase === 'JOIN_SENT'
          ? 'Reconectando'
          : radioSession.phase === 'REQUESTING'
            ? 'Solicitando'
          : radioSession.phase === 'ERROR'
            ? 'No disponible'
            : !activeChannel
              ? 'Sin canal'
              : 'Listo';
  const isBusy = radioSession.phase === 'UPLOADING';
  const pttBlockReason = !supportsTapToTalk
    ? 'Audio API no disponible'
    : audioPermissionState === 'denied'
      ? Platform.OS === 'web'
        ? 'Mic bloqueado'
        : 'Toca para reintentar microfono'
      : radioSession.phase === 'RECEIVING' || radioSession.phase === 'CHANNEL_BUSY'
        ? `Canal ocupado por ${liveOperator?.name || 'otro operador'}`
      : isBusy
        ? 'Transmision en curso'
        : !activeChannel
          ? 'Sin canal activo'
          : !pttConnectionReady
              ? pttConnectionDetail
              : null;
  const isPttDisabled =
    !supportsTapToTalk ||
    (Platform.OS === 'web' && audioPermissionState === 'denied') ||
    isBusy ||
    radioSession.phase === 'RECEIVING' ||
    radioSession.phase === 'CHANNEL_BUSY' ||
    !activeChannel ||
    (!pttConnectionReady && radioSession.phase !== 'TRANSMITTING');
  const radioPhase = radioSession.phase;

  useEffect(() => {
    const service = new RadioRealtimeService({
      onEnd: ({ transmissionId }) => {
        const current = radioSessionRef.current;
        if (current.phase === 'CHANNEL_BUSY') {
          transitionSession({ phase: 'READY', operator: null, message: null, transmissionId: null });
          return;
        }
        if (current.transmissionId !== transmissionId) return;
        if (current.phase === 'TRANSMITTING' || current.phase === 'UPLOADING') {
          stopPttAudioCapture().catch(() => undefined);
        }
        if (current.phase === 'RECEIVING') {
          stopPttAudioPlayback().catch(() => undefined);
        }
        if (current.phase === 'ERROR') {
          transitionSession({
            phase: 'ERROR',
            operator: null,
            transmissionId: null,
          });
          waveformLevels.value = Array(18).fill(0);
          return;
        }
        transitionSession({
          phase: 'READY',
          operator: null,
          message: current.phase === 'TRANSMITTING' || current.phase === 'UPLOADING'
            ? 'Transmision finalizada'
            : null,
          transmissionId: null,
        });
        waveformLevels.value = Array(18).fill(0);
      },
      onError: (message) => {
        const current = radioSessionRef.current;
        stopPttAudioCapture().catch(() => undefined);
        stopPttAudioPlayback().catch(() => undefined);
        transitionSession({
          phase: current.phase === 'TRANSMITTING' || current.phase === 'RECEIVING' ? 'ERROR' : 'READY',
          message,
          operator: current.phase === 'RECEIVING' ? current.operator : null,
          transmissionId: current.phase === 'TRANSMITTING' || current.phase === 'RECEIVING'
            ? current.transmissionId
            : null,
        });
      },
      onFrame: (frame) => {
        if (frame.transmissionId !== radioSessionRef.current.transmissionId) return;
        enqueuePttAudioFrame(frame.data, frame.sequence, frame.transmissionId).catch(() => {
          stopPttAudioPlayback().catch(() => undefined);
          transitionSession({
            phase: 'ERROR',
            message: 'Audio recibido no disponible',
            operator: radioSessionRef.current.operator,
            transmissionId: frame.transmissionId,
          });
        });
      },
      onStateChange: (state) => {
        const current = radioSessionRef.current;
        const transportInterrupted =
          state === 'offline' || state === 'reconnecting' || state === 'unauthorized' || state === 'error';
        if (transportInterrupted && current.phase === 'TRANSMITTING') {
          stopPttAudioCapture().catch(() => undefined);
        }
        if (transportInterrupted && current.phase === 'RECEIVING') {
          stopPttAudioPlayback().catch(() => undefined);
        }
        const phase: RadioOperationalPhase =
          state === 'connecting'
            ? 'CONNECTING'
            : state === 'join_sent'
              ? 'JOIN_SENT'
              : state === 'reconnecting'
                ? 'RECONNECTING'
                : state === 'offline'
                  ? 'OFFLINE'
                : state === 'unauthorized'
                  ? 'UNAUTHORIZED'
                  : state === 'error'
                    ? 'ERROR'
                    : 'READY';
        transitionSession({ phase, message: null, operator: null, transmissionId: null });
      },
      onStart: ({ transmissionId, transmitter }) => {
        const ownTransmission = transmitter.id === user?.id;
        if (ownTransmission) return;
        transitionSession({
          phase: 'RECEIVING',
          operator: transmitter,
          message: `Recibiendo: ${transmitter.name}`,
          transmissionId,
        });
        stopActiveAudioPlaybackAsync()
          .then(async () => {
            const beforeStart = radioSessionRef.current;
            if (beforeStart.phase !== 'RECEIVING' || beforeStart.transmissionId !== transmissionId) return;
            await startPttAudioPlayback(transmissionId);
            const afterStart = radioSessionRef.current;
            if (afterStart.phase !== 'RECEIVING' || afterStart.transmissionId !== transmissionId) {
              await stopPttAudioPlayback();
            }
          })
          .catch((error) => {
            const current = radioSessionRef.current;
            if (current.phase !== 'RECEIVING' || current.transmissionId !== transmissionId) return;
            transitionSession({
              phase: 'ERROR',
              message: error instanceof Error ? error.message : 'Audio no disponible',
              operator: transmitter,
              transmissionId,
            });
          });
      },
    });
    realtimeServiceRef.current = service;
    return () => {
      const current = radioSessionRef.current;
      if ((current.phase === 'TRANSMITTING' || current.phase === 'UPLOADING') && current.transmissionId) {
        service.endTransmission(current.transmissionId).catch(() => undefined);
      }
      service.disconnect();
      realtimeServiceRef.current = null;
      stopPttAudioCapture().catch(() => undefined);
      stopPttAudioPlayback().catch(() => undefined);
    };
  }, [transitionSession, user?.id, waveformLevels]);

  useEffect(() => {
    const previousChannelId = previousChannelIdRef.current;
    const nextChannelId = activeChannel?.id || null;
    previousChannelIdRef.current = nextChannelId;
    if (!previousChannelId || previousChannelId === nextChannelId) return;

    const current = radioSessionRef.current;
    if (current.phase === 'TRANSMITTING' && current.transmissionId) {
      stopPttAudioCapture().catch(() => undefined);
      realtimeServiceRef.current?.endTransmission(current.transmissionId).catch(() => undefined);
    }
    if (current.phase === 'RECEIVING') {
      stopPttAudioPlayback().catch(() => undefined);
    }
  }, [activeChannel?.id]);

  useEffect(() => {
    if (!token || !activeChannel?.id) return;
    realtimeServiceRef.current?.connect(getSharedRealtimeSocket(), activeChannel.id);
  }, [activeChannel?.id, socketStatus, token]);

  useEffect(() => {
    if (!token || !activeChannel?.id) return;
    startRadioForegroundService().catch(() => undefined);
    return () => {
      stopRadioForegroundService().catch(() => undefined);
    };
  }, [activeChannel?.id, token]);

  useEffect(() => {
    const removeFrames = subscribeToPttAudioFrames((frame) => {
      const { transmissionId, phase } = radioSessionRef.current;
      if (!transmissionId || phase !== 'TRANSMITTING' || frame.bytes !== 640) return;
      const sent = realtimeServiceRef.current?.sendFrame({
        data: frame.data,
        sequence: frame.sequence,
        sentAt: frame.capturedAt,
        transmissionId,
      });
      if (sent === false) {
        stopPttAudioCapture().catch(() => undefined);
        transitionSession({ phase: 'OFFLINE', message: 'Conexion PTT interrumpida', operator: null, transmissionId: null });
        return;
      }
    });
    const removeErrors = subscribeToPttAudioErrors(() => {
      const current = radioSessionRef.current;
      const transmissionId = current.transmissionId;
      if (current.phase === 'TRANSMITTING') {
        stopPttAudioCapture().catch(() => undefined);
        if (transmissionId) realtimeServiceRef.current?.endTransmission(transmissionId).catch(() => undefined);
      } else if (current.phase === 'RECEIVING') {
        stopPttAudioPlayback().catch(() => undefined);
      }
      transitionSession({
        phase: 'ERROR',
        message: 'Error de audio PTT.',
        operator: current.operator,
        transmissionId,
      });
    });
    const removeLevel = subscribeToPttAudioLevel(({ level }) => {
      pushWaveformLevel(level);
    });
    return () => {
      removeFrames();
      removeErrors();
      removeLevel();
    };
  }, [pushWaveformLevel, transitionSession]);

  useEffect(() => {
    const nextUserId = user?.id || null;
    if (previousUserIdRef.current === nextUserId) {
      return;
    }

    previousUserIdRef.current = nextUserId;
    bootstrappedRef.current = false;
    previousChannelIdRef.current = null;
    previousRadioSocketStatusRef.current = socketStatus;
    historyLoadInFlightRef.current.clear();
  }, [socketStatus, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadRadioHistory = async () => {
      for (const channel of radioChannels) {
        if (cancelled) return;
        await ensureRadioHistoryLoaded(channel.id).catch(() => undefined);
      }
    };
    loadRadioHistory().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ensureRadioHistoryLoaded, radioChannels]);

  useEffect(() => {
    const previousStatus = previousRadioSocketStatusRef.current;
    previousRadioSocketStatusRef.current = socketStatus;
    const recovered =
      socketStatus === 'connected' &&
      ['disconnected', 'error', 'reconnecting'].includes(previousStatus);
    if (!recovered) return;
    radioChannels.forEach((channel) => {
      ensureRadioHistoryLoaded(channel.id).catch(() => undefined);
    });
  }, [ensureRadioHistoryLoaded, radioChannels, socketStatus]);

  const pttAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseValue.value }],
  }));

  const haloAnimatedStyle = useAnimatedStyle(() => ({
    opacity: haloValue.value,
    transform: [{ scale: 1 + haloValue.value * 0.18 }],
  }));

  useEffect(() => {
    if (radioPhase === 'TRANSMITTING') {
      pulseValue.value = withRepeat(
        withSequence(withTiming(1.04, RADIO_MOTION), withTiming(1, RADIO_MOTION)),
        -1,
        true
      );
      haloValue.value = withRepeat(
        withSequence(withTiming(0.72, RADIO_MOTION), withTiming(0, RADIO_MOTION)),
        -1,
        false
      );
      return () => {
        cancelAnimation(pulseValue);
        cancelAnimation(haloValue);
        pulseValue.value = 1;
        haloValue.value = 0;
      };
    }

    cancelAnimation(pulseValue);
    cancelAnimation(haloValue);
    pulseValue.value = withTiming(1, RADIO_MOTION);
    haloValue.value = withTiming(0, RADIO_MOTION);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    recordStartedAtRef.current = null;
    maxRecordingStopRequestedRef.current = false;
    setRecordingSeconds(0);
    waveformLevels.value = Array(18).fill(0);
    return undefined;
  }, [haloValue, pulseValue, radioPhase, waveformLevels]);

  const stopWebMetering = useCallback(() => {
    meteringActiveRef.current = false;

    if (meteringFrameRef.current) {
      cancelAnimationFrame(meteringFrameRef.current);
      meteringFrameRef.current = null;
    }

    meteringCleanupRef.current?.();
    meteringCleanupRef.current = null;
    waveformLevels.value = Array(18).fill(0);
  }, [waveformLevels]);

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
  }, [loadChatContacts, setRecorderMessage]);

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

    bootstrappedRef.current = true;

    // Canal preferido solo si ya lo tenemos localmente (deep-link o canal activo).
    const preferredChannelId =
      params.channelId && radioChannels.some((conversation) => conversation.id === params.channelId)
        ? params.channelId
        : activeConversationId &&
      radioChannels.some((conversation) => conversation.id === activeConversationId)
        ? activeConversationId
        : null;

    if (preferredChannelId) {
      setActiveConversationId(preferredChannelId);
    }

    // Siempre aseguramos el canal general de radio (sin robar el canal activo): el
    // backend resincroniza participantes, requisito para que `radio:join` autorice
    // la sala del canal general. Sin esto, un usuario que ya tenia canales directos
    // nunca se enrolaba y quedaba limitado a punto a punto.
    openGeneralConversation('radio', { setActive: false })
      .then((conversation) => {
        if (preferredChannelId) return;
        const nextChannelId = conversation?.id || generalRadioChannel?.id || radioChannels[0]?.id;
        if (nextChannelId) {
          setActiveConversationId(nextChannelId);
        }
      })
      .catch(() => {
        if (preferredChannelId) return;
        const fallbackChannelId = generalRadioChannel?.id || radioChannels[0]?.id;
        if (fallbackChannelId) {
          setActiveConversationId(fallbackChannelId);
        }
      });
  }, [activeConversationId, generalRadioChannel?.id, openGeneralConversation, params.channelId, radioChannels, setActiveConversationId]);

  useEffect(() => {
    if (!radioChannels.length) {
      return;
    }

    const exists = radioChannels.some((conversation) => conversation.id === activeConversationId);

    if (exists) {
      return;
    }

    setActiveConversationId(generalRadioChannel?.id || radioChannels[0].id);
  }, [activeConversationId, generalRadioChannel?.id, radioChannels, setActiveConversationId]);

  useEffect(() => {
    stopActiveAudioPlaybackAsync().catch(() => undefined);
  }, [activeConversationId]);

  useRadioLifecycle({
    messageStatusTimerRef,
    pendingStopAfterStartRef,
    pressToTalkActiveRef,
    pressToTalkTimerRef,
    pressToTalkTriggeredRef,
    pttBusyRef,
    recordTimerRef,
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

  const scheduleMessageClear = (delayMs = 1400) => {
    if (messageStatusTimerRef.current) {
      clearTimeout(messageStatusTimerRef.current);
    }

    messageStatusTimerRef.current = setTimeout(() => {
      if (radioSessionRef.current.phase === 'READY' && radioSessionRef.current.message) {
        transitionSession({ phase: 'READY', message: null, operator: null, transmissionId: null });
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
        pushWaveformLevel(nextVolume);
        meteringFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (error) {
      console.warn('Web Audio Metering failed', error);
    }
  };

  const handleSelectChannel = async (channelId: string) => {
    setActiveConversationId(channelId);
    await ensureRadioHistoryLoaded(channelId);
  };

  const handleOpenGeneralRadio = async () => {
    const conversation = await openGeneralConversation('radio');

    if (conversation?.id) {
      setActiveConversationId(conversation.id);
    }
  };

  const handleOpenDirectRadio = async (contactId: string) => {
    const conversation = await openDirectConversation(contactId, 'radio');

    if (conversation?.id) {
      setActiveConversationId(conversation.id);
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

  useEffect(() => {
    if (!params.channelId || !radioChannels.some((conversation) => conversation.id === params.channelId)) {
      return;
    }
    setActiveConversationId(params.channelId);
    if (params.mode === 'ptt') {
      goToPage(INITIAL_RADIO_PAGE_INDEX);
    }
  }, [goToPage, params.channelId, params.mode, radioChannels, setActiveConversationId]);

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

  const startNativeRecording = async () => {
    if (!activeChannel) {
      return;
    }

    if (!pttConnectionReady) {
      setRecorderMessage(pttConnectionDetail);
      return;
    }

    await stopActiveAudioPlaybackAsync().catch(() => undefined);

    const permission = await requestRecordingPermissionsAsync();

    if (!permission.granted) {
      setAudioPermissionState('denied');
      setRecorderMessage('Mic bloqueado');
      scheduleMessageClear();
      return;
    }

    transitionSession({ phase: 'REQUESTING', message: 'Solicitando canal', operator: null, transmissionId: null });
    const ack = await realtimeServiceRef.current?.requestTransmission();
    if (ack?.error === 'radio_request_stale') return;
    if (radioSessionRef.current.phase === 'RECEIVING') {
      if (ack?.ok && ack.transmissionId) {
        realtimeServiceRef.current?.endTransmission(ack.transmissionId).catch(() => undefined);
      }
      return;
    }
    if (!ack?.ok || !ack.transmissionId) {
      const unauthorized = ack?.error === 'forbidden' || ack?.error === 'unauthorized';
      const disconnected = ack?.error === 'radio_disconnected' || ack?.error === 'radio_ack_timeout';
      transitionSession({
        phase: ack?.error === 'channel_busy' ? 'CHANNEL_BUSY' : unauthorized ? 'UNAUTHORIZED' : disconnected ? 'RECONNECTING' : 'ERROR',
        message: ack?.error === 'channel_busy' ? 'Canal ocupado' : unauthorized ? 'Sesion expirada' : 'Radio no disponible',
        operator: ack?.transmitter || null,
        transmissionId: null,
      });
      return;
    }
    if (pendingStopAfterStartRef.current) {
      pendingStopAfterStartRef.current = false;
      transitionSession({
        phase: 'UPLOADING',
        message: 'Cancelando transmision',
        operator: user ? { id: user.id, name: user.name || 'Operador' } : null,
        transmissionId: ack.transmissionId,
      });
      const cancelAck = await realtimeServiceRef.current?.endTransmission(ack.transmissionId);
      if (!cancelAck?.ok && radioSessionRef.current.phase === 'UPLOADING') {
        transitionSession({
          phase: cancelAck?.error === 'radio_disconnected' ? 'OFFLINE' : 'ERROR',
          message: 'No fue posible cancelar la transmision',
          operator: null,
          transmissionId: null,
        });
      }
      return;
    }
    transitionSession({
      phase: 'TRANSMITTING',
      transmissionId: ack.transmissionId,
      operator: user ? { id: user.id, name: user.name || 'Operador' } : null,
      message: `Transmitiendo: ${user?.name || 'Operador'}`,
    });
    waveformLevels.value = Array(18).fill(0);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await startPttAudioCapture(ack.transmissionId);
      const activeSession = radioSessionRef.current;
      if (activeSession.phase !== 'TRANSMITTING' || activeSession.transmissionId !== ack.transmissionId) {
        await stopPttAudioCapture();
        return;
      }
    } catch (error) {
      transitionSession({
        phase: 'ERROR',
        message: error instanceof Error ? error.message : 'Audio no disponible',
        transmissionId: ack.transmissionId,
        operator: user ? { id: user.id, name: user.name || 'Operador' } : null,
      });
      await realtimeServiceRef.current?.endTransmission(ack.transmissionId);
      throw error;
    }
    startRecordingTicker();
    setAudioPermissionState('granted');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const stopNativeRecording = async () => {
    if (!activeChannel) {
      return;
    }

    const transmissionId = radioSessionRef.current.transmissionId;
    transitionSession({ phase: 'UPLOADING', message: 'Finalizando transmision' });
    await stopPttAudioCapture();
    if (!transmissionId) {
      transitionSession({ phase: 'ERROR', message: 'Sesion PTT invalida', operator: null, transmissionId: null });
      return;
    }
    const ack = await realtimeServiceRef.current?.endTransmission(transmissionId);
    if (!ack?.ok && radioSessionRef.current.phase === 'UPLOADING') {
      const disconnected = ack?.error === 'radio_disconnected' || ack?.error === 'radio_ack_timeout';
      transitionSession({
        phase: disconnected ? 'OFFLINE' : 'ERROR',
        message: disconnected ? 'Conexion PTT interrumpida' : 'No fue posible liberar el canal',
        operator: null,
        transmissionId: null,
      });
    } else if (ack?.ok) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const startWebRecording = async () => {
    if (!activeChannel) {
      return;
    }

    if (!pttConnectionReady) {
      setRecorderMessage(pttConnectionDetail);
      return;
    }

    await stopActiveAudioPlaybackAsync().catch(() => undefined);

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
    transitionSession({
      phase: 'TRANSMITTING',
      transmissionId: null,
      operator: user ? { id: user.id, name: user.name || 'Operador' } : null,
      message: `Transmitiendo: ${user?.name || 'Operador'}`,
    });
    waveformLevels.value = Array(18).fill(0);
  };

  const stopWebRecording = async () => {
    if (!activeChannel || !webRecorderRef.current) {
      return;
    }

    transitionSession({ phase: 'UPLOADING', message: 'Enviando audio' });
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
        transitionSession({ phase: 'READY', message: 'Manten presionado al menos 1 segundo', operator: null, transmissionId: null });
        scheduleMessageClear();
        return;
      }

      uploadStartedAtRef.current = null;
      transitionSession({ phase: 'READY', message: 'Enviado', operator: null, transmissionId: null });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scheduleMessageClear();
    } finally {
      webRecorderRef.current = null;
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      webStreamRef.current = null;
      webChunksRef.current = [];
      stopWebMetering();
      uploadStartedAtRef.current = null;
      if (radioSessionRef.current.phase === 'UPLOADING') {
        transitionSession({ phase: 'READY', operator: null, transmissionId: null });
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
    const currentPhase = radioSessionRef.current.phase;

    if (!activeChannel || !supportsTapToTalk || currentPhase === 'UPLOADING' || pttBusyRef.current) {
      return;
    }

    if (currentPhase !== 'TRANSMITTING' && !pttConnectionReady) {
      setRecorderMessage(pttConnectionDetail);
      return;
    }

    pttBusyRef.current = true;

    try {
      if (currentPhase === 'TRANSMITTING') {
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
      uploadStartedAtRef.current = null;
      const isPermissionError =
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'NotAllowedError';
      const message = error instanceof Error ? error.message : 'Audio no disponible';
      if (isPermissionError) {
        setAudioPermissionState('denied');
      }
      const current = radioSessionRef.current;
      const connected = ['READY', 'TRANSMITTING', 'UPLOADING'].includes(current.phase);
      transitionSession({
        phase: connected ? 'READY' : current.phase,
        message: isPermissionError ? 'Mic bloqueado' : message,
        operator: connected ? null : current.operator,
        transmissionId: connected ? null : current.transmissionId,
      });
      if (connected) scheduleMessageClear(2200);
    } finally {
      pttBusyRef.current = false;

      if (pendingStopAfterStartRef.current && radioSessionRef.current.phase === 'TRANSMITTING') {
        pendingStopAfterStartRef.current = false;
        handleTapToTalk();
        return;
      }

      if (radioSessionRef.current.phase !== 'TRANSMITTING') {
        pendingStopAfterStartRef.current = false;
      }
    }
  };

  const handlePttPressIn = () => {
    if (Platform.OS === 'web' || radioSessionRef.current.phase !== 'READY') {
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

    if (radioSessionRef.current.phase === 'TRANSMITTING') {
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
    switch (radioPhase) {
      case 'TRANSMITTING':
      return {
        detail: 'Transmitiendo',
        icon: 'microphone' as const,
        label: 'Transmitiendo',
        tone: 'danger' as const,
      };
      case 'REQUESTING':
        return {
          detail: 'Solicitando',
          icon: 'sync' as const,
          label: 'Solicitando',
          tone: 'info' as const,
        };
      case 'UPLOADING':
      return {
        detail: 'Enviando',
        icon: 'cloud-upload-outline' as const,
        label: 'Enviando',
        tone: 'info' as const,
      };
      case 'RECEIVING':
        return {
          detail: `Reproduciendo: ${liveOperator?.name || 'Operador'}`,
          icon: 'volume-high' as const,
          label: 'Reproduciendo',
          tone: 'info' as const,
        };
      case 'CHANNEL_BUSY':
        return {
        detail: `Ocupado: ${liveOperator?.name || 'Otro'}`,
        icon: 'account-voice' as const,
        label: 'Canal ocupado',
          tone: 'warning' as const,
        };
      case 'RECONNECTING':
        return {
          detail: 'Reconectando',
          icon: 'sync' as const,
          label: 'Reconectando',
          tone: 'info' as const,
        };
      case 'UNAUTHORIZED':
        return {
          detail: 'Vuelve a iniciar sesion',
          icon: 'lock-alert-outline' as const,
          label: 'Sesion expirada',
          tone: 'danger' as const,
        };
      case 'ERROR':
      return {
        detail: recorderMessage || 'Revisa el audio e intenta de nuevo',
        icon: 'alert-circle-outline' as const,
        label: 'Error',
        tone: 'danger' as const,
      };
      case 'CONNECTING':
        return {
          detail: 'Conectando',
          icon: 'sync' as const,
          label: 'Conectando',
          tone: 'info' as const,
        };
      case 'JOIN_SENT':
        return {
          detail: 'Preparando canal',
          icon: 'access-point-check' as const,
          label: 'Conectado',
          tone: 'info' as const,
        };
      case 'OFFLINE':
        return {
          detail: 'Radio desconectado',
          icon: 'access-point-off' as const,
          label: 'Desconectado',
          tone: 'warning' as const,
        };
      case 'READY':
        return {
          detail: activeChannel?.title || 'Listo',
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
  const radioActionText =
    recorderMessage ||
    (audioPermissionState === 'denied' ? 'Microfono bloqueado' : null);
  const pttDisabledText =
    radioPhase === 'RECEIVING' || radioPhase === 'CHANNEL_BUSY'
      ? liveStatus.label
      : pttBlockReason || 'No disponible';
  const pttStateStyle =
    radioPhase === 'TRANSMITTING'
      ? styles.pttButtonRecording
      : radioPhase === 'CHANNEL_BUSY'
        ? styles.pttButtonBusy
        : radioPhase === 'UPLOADING' ||
            radioPhase === 'REQUESTING' ||
            radioPhase === 'RECEIVING' ||
            radioPhase === 'RECONNECTING' ||
            radioPhase === 'CONNECTING' ||
            radioPhase === 'JOIN_SENT'
          ? styles.pttButtonUploading
          : radioPhase === 'ERROR' || radioPhase === 'UNAUTHORIZED'
            ? styles.pttButtonError
            : radioPhase === 'OFFLINE'
              ? styles.pttButtonOffline
              : styles.pttButtonIdle;
  const pttIcon = liveStatus.icon;
  const pttButtonTitle =
    radioPhase === 'TRANSMITTING'
      ? formatDuration(recordingSeconds)
      : liveStatus.label;
  const pttButtonSubtitle =
    radioPhase === 'TRANSMITTING'
      ? 'Soltar para finalizar'
      : radioPhase === 'READY'
        ? 'Mantener para hablar'
        : radioPhase === 'RECEIVING'
          ? 'Reproduciendo'
          : isPttDisabled
            ? pttDisabledText
            : liveStatus.detail;
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
                <MaterialCommunityIcons name="account-group" size={14} color={theme.colors.muted} />
                <Text style={styles.headerMiniText} numberOfLines={1}>
                  {activeOperatorCount || '--'} miembros
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
        <RadioDirectoryPage
          activeChannelId={activeChannel?.id || null}
          channels={filteredChannels}
          contacts={filteredContacts}
          currentUserId={user.id}
          hoveredItemId={hoveredRadioItemId}
          onHoverItem={setHoveredRadioItemId}
          onOpenDirectContact={handleOpenDirectRadio}
          onOpenGeneralRadio={handleOpenGeneralRadio}
          onSearchChange={setSearch}
          onSelectChannel={handleSelectChannel}
          presenceByUser={presenceByUser}
          search={search}
          styles={styles}
          theme={theme}
        />

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
            </View>

            <View style={styles.pttCenter}>
              <Animated.View style={[styles.pttHalo, haloAnimatedStyle]} />
              {radioPhase === 'TRANSMITTING' ? (
                <PttAudioWave diameter={isPhone ? 244 : 284} samples={waveformLevels} />
              ) : null}
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
                  {radioSession.phase === 'UPLOADING' || radioSession.phase === 'REQUESTING' ? (
                    <ActivityIndicator color="#FFFFFF" size="large" />
                  ) : (
                    <MaterialCommunityIcons name={pttIcon} size={isPhone ? 50 : 58} color="#FFFFFF" />
                  )}
                  <Text style={styles.pttButtonTitle}>
                    {pttButtonTitle}
                  </Text>
                  <Text style={styles.pttButtonSubtitle}>
                    {pttButtonSubtitle}
                  </Text>
                </Pressable>
              </Animated.View>
            </View>

            <View style={styles.consoleMetaRow}>
              <View style={styles.consoleMetaItem}>
                <MaterialCommunityIcons name="access-point" size={18} color={theme.colors.muted} />
                <View style={styles.consoleMetaCopy}>
                  <Text style={styles.consoleMetaLabel}>Canal activo</Text>
                  <Text style={styles.consoleMetaValue} numberOfLines={1}>{activeChannel?.title || 'Sin canal'}</Text>
                </View>
              </View>
              <View style={styles.consoleMetaDivider} />
              <View style={styles.consoleMetaItem}>
                <MaterialCommunityIcons name="history" size={18} color={theme.colors.muted} />
                <View style={styles.consoleMetaCopy}>
                  <Text style={styles.consoleMetaLabel}>Ultima actividad</Text>
                  <Text style={styles.consoleMetaValue} numberOfLines={1}>
                    {loadedVoiceNotes[0]
                      ? formatRelativeTime(loadedVoiceNotes[0].message.createdAt)
                      : 'Sin actividad'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          </View>

          <View style={[styles.page, { width: pageWidth }]}>
          <RadioAudiosPage
            activeFilter={audioFilter}
            filters={availableAudioFilters}
            onFilterChange={setAudioFilter}
            presenceByUser={presenceByUser}
            styles={styles}
            theme={theme}
            token={token}
            voiceNotes={filteredVoiceNotes}
          />
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
