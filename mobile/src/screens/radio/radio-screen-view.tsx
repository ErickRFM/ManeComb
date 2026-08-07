import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import {
  requestRecordingPermissionsAsync,
  stopActiveAudioPlaybackAsync,
  subscribeToPttAudioLevel,
} from '@/src/native/audio';
import * as Haptics from '@/src/native/haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getRadioLiveErrorMessage } from '@/src/features/radio-live/radio-live-errors';
import { RADIO_LIVE_SUPPORTED } from '@/src/features/radio-live/radio-live-runtime';
import { useRadioLiveStore } from '@/src/features/radio-live/radio-live-store';
import { formatRelativeTime } from '@/src/utils/format';
import { createStyles } from './radio-screen.styles';
import { PttAudioWave } from './components/ptt-audio-wave';
import { RadioAudiosPage } from './components/radio-audios-page';
import { RadioDirectoryPage } from './components/radio-directory-page';
import {
  INITIAL_RADIO_PAGE_INDEX,
  MAX_RADIO_NOTE_SECONDS,
  MIN_RADIO_NOTE_SECONDS,
  RADIO_PAGES,
} from './constants';
import { getDeviceDisplayName, getTimeDomainVolume, withRadioTimeout } from './services/radio-audio-service';
import { useRadioLifecycle } from './hooks/use-radio-lifecycle';
import { useRadioAudioRoute } from './hooks/use-radio-audio-route';
import { getNextRadioRoute, getRadioRouteIcon, getRadioRouteLabel } from './utils/radio-audio-route';
import {
  deriveLiveConsole,
  deriveNoteConsole,
  type NoteConsolePhase,
  type RadioConsoleVariant,
} from './utils/radio-console';
import type {
  AudioFilter,
  AudioPermissionState,
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

// El PTT en vivo lo sirve el servicio nativo de Android. El resto de plataformas
// envian notas de voz completas y la consola lo dice explicitamente.
const LIVE_RADIO_SUPPORTED = RADIO_LIVE_SUPPORTED;
const WAVEFORM_BARS = 18;

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

  // La pantalla observa el runtime unico de Radio y le envia comandos: no posee
  // socket, maquina de estados, captura ni reproduccion.
  const {
    endTransmission,
    lastErrorCode,
    radioChannelId,
    radioPhase,
    requestTransmission,
    transmissionStartedAt,
    transmitter,
  } = useRadioLiveStore(
    useShallow((state) => ({
      endTransmission: state.endTransmission,
      lastErrorCode: state.lastErrorCode,
      radioChannelId: state.channelId,
      radioPhase: state.phase,
      requestTransmission: state.requestTransmission,
      transmissionStartedAt: state.transmissionStartedAt,
      transmitter: state.operator,
    }))
  );

  const { audioRoute, cycleRoute } = useRadioAudioRoute(LIVE_RADIO_SUPPORTED);

  const styles = useMemo(
    () => createStyles(theme, isDesktop, isPhone),
    [theme, isDesktop, isPhone]
  );
  const [search, setSearch] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [noteConsolePhase, setNoteConsolePhase] = useState<NoteConsolePhase>('IDLE');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
  const previousRadioSocketStatusRef = useRef(socketStatus);
  // El ticker de duracion maxima vive fuera del ciclo de render: necesita el
  // comando vigente, no el capturado en el primer render.
  const tapToTalkRef = useRef<(() => void) | null>(null);
  const previousUserIdRef = useRef<string | null>(user?.id || null);
  const historyLoadInFlightRef = useRef<Set<string>>(new Set());
  const pulseValue = useSharedValue(1);
  const haloValue = useSharedValue(0);
  const waveformLevels = useSharedValue<number[]>(Array(WAVEFORM_BARS).fill(0));
  const pushWaveformLevel = useCallback((level: number) => {
    const normalized = Math.max(0, Math.min(1, level));
    waveformLevels.value = [...waveformLevels.value.slice(1), normalized];
  }, [waveformLevels]);
  const resetWaveform = useCallback(() => {
    waveformLevels.value = Array(WAVEFORM_BARS).fill(0);
  }, [waveformLevels]);

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
  const supportsWebRecording =
    typeof globalThis !== 'undefined' &&
    Boolean((globalThis as any).navigator?.mediaDevices?.getUserMedia) &&
    typeof (globalThis as any).MediaRecorder !== 'undefined';

  const runtimeErrorMessage = getRadioLiveErrorMessage(lastErrorCode);
  const channelSynced = Boolean(activeChannel && radioChannelId === activeChannel.id);
  const consoleState = LIVE_RADIO_SUPPORTED
    ? deriveLiveConsole({
        channelSynced,
        errorMessage: statusMessage || runtimeErrorMessage,
        microphoneBlocked: audioPermissionState === 'denied',
        operator: transmitter,
        phase: radioPhase,
        selectedChannelTitle: activeChannel?.title || null,
      })
    : deriveNoteConsole({
        errorMessage: statusMessage,
        microphoneBlocked: audioPermissionState === 'denied',
        phase: noteConsolePhase,
        selectedChannelTitle: activeChannel?.title || null,
        supported: supportsWebRecording,
      });
  const isCapturing = consoleState.capturing;

  // La waveform es metering de UI: solo se alimenta mientras la pantalla esta
  // montada y nunca participa del camino critico de audio.
  useEffect(() => {
    if (!LIVE_RADIO_SUPPORTED) return undefined;
    const removeLevel = subscribeToPttAudioLevel(({ level }) => pushWaveformLevel(level));
    return removeLevel;
  }, [pushWaveformLevel]);

  useEffect(() => {
    const nextUserId = user?.id || null;
    if (previousUserIdRef.current === nextUserId) {
      return;
    }

    previousUserIdRef.current = nextUserId;
    bootstrappedRef.current = false;
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

  const scheduleMessageClear = useCallback((delayMs = 1800) => {
    if (messageStatusTimerRef.current) {
      clearTimeout(messageStatusTimerRef.current);
    }

    messageStatusTimerRef.current = setTimeout(() => setStatusMessage(null), delayMs);
  }, []);

  const stopWebMetering = useCallback(() => {
    meteringActiveRef.current = false;

    if (meteringFrameRef.current) {
      cancelAnimationFrame(meteringFrameRef.current);
      meteringFrameRef.current = null;
    }

    meteringCleanupRef.current?.();
    meteringCleanupRef.current = null;
    resetWaveform();
  }, [resetWaveform]);

  // Animacion, halo, cronometro y waveform siguen la fase canonica: se cancelan
  // en cualquier salida, incluida la de error o la que decide el backend.
  useEffect(() => {
    if (isCapturing) {
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
    resetWaveform();
    return undefined;
  }, [haloValue, isCapturing, pulseValue, resetWaveform]);

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

  const startRecordingTicker = useCallback((startedAt: number) => {
    recordStartedAtRef.current = startedAt;
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
        tapToTalkRef.current?.();
      }
    }, 400);
  }, []);

  // El cronometro de transmision sigue el instante autoritativo del runtime.
  useEffect(() => {
    if (!LIVE_RADIO_SUPPORTED || !transmissionStartedAt) return;
    startRecordingTicker(transmissionStartedAt);
  }, [startRecordingTicker, transmissionStartedAt]);

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

  // ---- PTT en vivo (comandos al runtime unico) ----

  const startLiveTransmission = async () => {
    const permission = await requestRecordingPermissionsAsync();

    if (!permission.granted) {
      setAudioPermissionState('denied');
      setStatusMessage('Microfono bloqueado');
      scheduleMessageClear();
      return;
    }

    setAudioPermissionState('granted');
    await stopActiveAudioPlaybackAsync().catch(() => undefined);

    const result = await requestTransmission();

    if (result.ok) {
      setStatusMessage(null);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      return;
    }

    if (result.error === 'radio_request_stale') return;
    setStatusMessage(getRadioLiveErrorMessage(result.error));
    scheduleMessageClear(2200);
  };

  const stopLiveTransmission = async () => {
    const result = await endTransmission();
    if (result.ok) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (result.error && result.error !== 'transmission_not_active') {
      setStatusMessage(getRadioLiveErrorMessage(result.error));
      scheduleMessageClear(2200);
    }
  };

  // ---- Notas de voz (Web) ----

  const startWebRecording = async () => {
    if (!activeChannel) {
      return;
    }

    await stopActiveAudioPlaybackAsync().catch(() => undefined);

    const mediaDevices = (globalThis as any).navigator?.mediaDevices;
    const MediaRecorderCtor = (globalThis as any).MediaRecorder;

    if (!mediaDevices?.getUserMedia || !MediaRecorderCtor) {
      setStatusMessage('No disponible');
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
    startRecordingTicker(Date.now());
    setStatusMessage(null);
    setNoteConsolePhase('RECORDING');
    resetWaveform();
  };

  const stopWebRecording = async () => {
    if (!activeChannel || !webRecorderRef.current) {
      return;
    }

    setNoteConsolePhase('UPLOADING');
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
        setStatusMessage('Manten presionado al menos 1 segundo');
        scheduleMessageClear();
        return;
      }

      setStatusMessage('Enviado');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scheduleMessageClear();
    } finally {
      webRecorderRef.current = null;
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      webStreamRef.current = null;
      webChunksRef.current = [];
      stopWebMetering();
      uploadStartedAtRef.current = null;
      setNoteConsolePhase('IDLE');
    }
  };

  const requestAudioDeviceAccess = async () => {
    if (Platform.OS !== 'web' || !navigator.mediaDevices?.getUserMedia) {
      setStatusMessage('No disponible');
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
      setStatusMessage(null);
    } catch {
      setAudioPermissionState('denied');
      setStatusMessage('Microfono bloqueado');
    }
  };

  // Los gestos deben leer el estado vivo, no el del ultimo render: soltar el
  // boton entre la concesion del canal y el re-render no puede dejar el
  // microfono abierto.
  const isCapturingNow = () =>
    LIVE_RADIO_SUPPORTED
      ? useRadioLiveStore.getState().phase === 'TRANSMITTING'
      : Boolean(webRecorderRef.current);

  // Un unico comando de PTT, sin importar el origen del gesto.
  const handleTapToTalk = async () => {
    if (!activeChannel || pttBusyRef.current) {
      return;
    }

    pttBusyRef.current = true;

    try {
      if (isCapturingNow()) {
        if (LIVE_RADIO_SUPPORTED) {
          await stopLiveTransmission();
        } else {
          await stopWebRecording();
        }
        return;
      }

      if (LIVE_RADIO_SUPPORTED) {
        await startLiveTransmission();
        return;
      }

      await startWebRecording();
    } catch (error) {
      stopWebMetering();
      uploadStartedAtRef.current = null;
      setNoteConsolePhase('IDLE');
      const isPermissionError =
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'NotAllowedError';
      if (isPermissionError) {
        setAudioPermissionState('denied');
      }
      setStatusMessage(
        isPermissionError
          ? 'Microfono bloqueado'
          : error instanceof Error
            ? error.message
            : 'Audio no disponible'
      );
      scheduleMessageClear(2200);
    } finally {
      pttBusyRef.current = false;

      // Soltar el boton antes de que el canal fuera concedido cierra la
      // transmision en cuanto existe, sin dejar el microfono abierto.
      if (pendingStopAfterStartRef.current) {
        pendingStopAfterStartRef.current = false;
        if (isCapturingNow()) handleTapToTalk();
      }
    }
  };

  tapToTalkRef.current = handleTapToTalk;

  const handlePttPressIn = () => {
    if (consoleState.pttDisabled || isCapturingNow()) {
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

    if (pttBusyRef.current) {
      pendingStopAfterStartRef.current = true;
      return;
    }

    if (isCapturingNow()) {
      handleTapToTalk();
    }
  };

  const handlePttPress = () => {
    if (pressToTalkTriggeredRef.current) {
      pressToTalkTriggeredRef.current = false;
      return;
    }

    if (audioPermissionState === 'denied') {
      if (Platform.OS === 'web') {
        requestAudioDeviceAccess();
        return;
      }
      setAudioPermissionState('unknown');
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
  const consoleToneColor =
    consoleState.tone === 'danger'
      ? theme.colors.danger
      : consoleState.tone === 'warning'
        ? theme.colors.warning
        : consoleState.tone === 'info'
          ? theme.colors.info
          : consoleState.tone === 'positive'
            ? theme.colors.success
            : theme.colors.muted;
  const activeOperatorCount = activeChannel?.participants.length || 0;
  const pttVariantStyles: Record<RadioConsoleVariant, object> = {
    idle: styles.pttButtonIdle,
    recording: styles.pttButtonRecording,
    busy: styles.pttButtonBusy,
    pending: styles.pttButtonUploading,
    error: styles.pttButtonError,
    offline: styles.pttButtonOffline,
  };
  const pttButtonTitle = isCapturing ? formatDuration(recordingSeconds) : consoleState.pttTitle;
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
              <StatusPill label={consoleState.label} tone={consoleState.tone} />
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
                <Text style={styles.heroEyebrow}>
                  {LIVE_RADIO_SUPPORTED ? 'Consola PTT' : 'Notas de voz'}
                </Text>
                <Text style={styles.heroTitle}>
                  {consoleState.label}
                </Text>
              </View>
              <View style={styles.heroPills}>
                {audioRoute ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Salida de audio: ${getRadioRouteLabel(audioRoute.active)}`}
                    accessibilityState={{ disabled: !getNextRadioRoute(audioRoute) }}
                    disabled={!getNextRadioRoute(audioRoute)}
                    onPress={() => { cycleRoute(); }}
                    style={styles.deviceCompactChip}>
                    <MaterialCommunityIcons
                      name={getRadioRouteIcon(audioRoute.active) as any}
                      size={16}
                      color={theme.colors.info}
                    />
                    <Text style={styles.deviceCompactText} numberOfLines={1}>
                      {getRadioRouteLabel(audioRoute.active)}
                    </Text>
                  </Pressable>
                ) : null}
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
                  borderColor: consoleToneColor,
                },
              ]}>
              <View style={[styles.operationalIcon, { backgroundColor: consoleToneColor }]}>
                <MaterialCommunityIcons name={consoleState.icon as any} size={19} color="#FFFFFF" />
              </View>
              <View style={styles.operationalCopy}>
                <Text style={styles.operationalTitle} numberOfLines={1}>
                  {consoleState.detail}
                </Text>
                {statusMessage ? (
                  <Text style={styles.operationalAction} numberOfLines={1}>
                    {statusMessage}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.pttCenter}>
              <Animated.View style={[styles.pttHalo, haloAnimatedStyle]} />
              {isCapturing ? (
                <PttAudioWave diameter={isPhone ? 244 : 284} samples={waveformLevels} />
              ) : null}
              <Animated.View style={[styles.pttOuter, pttAnimatedStyle]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Push to talk. ${consoleState.label}. ${consoleState.pttSubtitle}`}
                  accessibilityState={{ disabled: consoleState.pttDisabled, busy: consoleState.pending }}
                  onPress={() => { handlePttPress(); }}
                  onPressIn={handlePttPressIn}
                  onPressOut={handlePttPressOut}
                  disabled={consoleState.pttDisabled}
                  style={[
                    styles.pttButton,
                    pttVariantStyles[consoleState.variant],
                    consoleState.pttDisabled ? styles.pttButtonDisabled : undefined,
                  ]}>
                  {consoleState.pending ? (
                    <ActivityIndicator color="#FFFFFF" size="large" />
                  ) : (
                    <MaterialCommunityIcons
                      name={consoleState.icon as any}
                      size={isPhone ? 50 : 58}
                      color="#FFFFFF"
                    />
                  )}
                  <Text style={styles.pttButtonTitle}>
                    {pttButtonTitle}
                  </Text>
                  <Text style={styles.pttButtonSubtitle}>
                    {consoleState.pttSubtitle}
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
                <MaterialCommunityIcons
                  name={transmitter ? 'account-voice' : 'history'}
                  size={18}
                  color={theme.colors.muted}
                />
                <View style={styles.consoleMetaCopy}>
                  <Text style={styles.consoleMetaLabel}>
                    {transmitter ? 'En el canal' : 'Ultima actividad'}
                  </Text>
                  <Text style={styles.consoleMetaValue} numberOfLines={1}>
                    {transmitter
                      ? transmitter.name
                      : loadedVoiceNotes[0]
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
