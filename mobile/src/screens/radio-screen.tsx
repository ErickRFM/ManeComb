import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { resolveAssetUrl } from '@/src/api/client';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { ChatDirectoryContact, ChatMessage, ConversationSummary } from '@/src/types/app';
import { formatRelativeTime, formatRole } from '@/src/utils/format';

type RecordingState = 'idle' | 'recording' | 'uploading';
type AudioPermissionState = 'unknown' | 'granted' | 'denied';

const MAX_RADIO_NOTE_SECONDS = 40;

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
    openDirectConversation,
    openGeneralConversation,
    sendVoiceMessage,
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
      sendVoiceMessage: state.sendVoiceMessage,
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

  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedAtRef = useRef<number | null>(null);
  const webRecorderRef = useRef<any>(null);
  const webStreamRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const bootstrappedRef = useRef(false);
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
  const activeMessages = useMemo(
    () => (activeChannel ? messagesByConversation[activeChannel.id] || [] : []),
    [activeChannel, messagesByConversation]
  );
  const recentVoiceNotes = useMemo(
    () =>
      activeMessages
        .filter((message) => message.kind === 'audio')
        .slice()
        .reverse()
        .slice(0, 8),
    [activeMessages]
  );
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
  const isBusy = isSubmitting || recordingState === 'uploading';

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
    void loadChatContacts();

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
      const handleDeviceChange = () => void loadDevices();

      void loadDevices();
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
      void loadConversation(preferredChannelId);
      return;
    }

    bootstrappedRef.current = true;
    void openGeneralConversation('radio').then((conversation) => {
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
    void loadConversation(radioChannels[0].id);
  }, [activeChannelId, loadConversation, radioChannels]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }

      stopWebMetering();
      void nativeRecorder.stop().catch(() => undefined);
      webRecorderRef.current?.stop?.();
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
    };
  }, [nativeRecorder, stopWebMetering]);

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

      if (elapsedSeconds >= MAX_RADIO_NOTE_SECONDS) {
        void handleTapToTalk();
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
    volumeValue.value = 0;
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
        void audioContext.close().catch(() => undefined);
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

  const startNativeRecording = async () => {
    if (!activeChannel) {
      return;
    }

    const permission = await requestRecordingPermissionsAsync();

    if (!permission.granted) {
      setRecorderMessage('Mic bloqueado');
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

    await nativeRecorder.prepareToRecordAsync();
    nativeRecorder.record();
    startRecordingTicker();
    syncRecordingAnimation(true);
    setRecorderMessage('Grabando');
    setRecordingMode('recording');
  };

  const stopNativeRecording = async () => {
    if (!activeChannel) {
      return;
    }

    setRecordingMode('uploading');
    await nativeRecorder.stop();
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
      setRecordingMode('idle');
      return;
    }

    const formData = new FormData();
    formData.append(
      'durationSeconds',
      String(Math.max(1, Math.round(Number(status.durationMillis || 0) / 1000)))
    );
    formData.append('file', {
      uri,
      name: `radio-note-${Date.now()}.m4a`,
      type: 'audio/mp4',
    } as any);

    await sendVoiceMessage(activeChannel.id, formData);
    setRecorderMessage('Enviado');
    setRecordingMode('idle');
  };

  const startWebRecording = async () => {
    if (!activeChannel) {
      return;
    }

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
    const durationSeconds = Math.max(
      1,
      Math.round((Date.now() - Number(recordStartedAtRef.current || Date.now())) / 1000)
    );

    try {
      await new Promise<void>((resolve, reject) => {
      recorder.onstop = async () => {
        try {
          const blob = new Blob(webChunksRef.current, { type: mimeType });
          const file = new File([blob], `radio-note-${Date.now()}.webm`, { type: mimeType });
          const formData = new FormData();
          formData.append('durationSeconds', String(durationSeconds));
          formData.append('file', file);
          await sendVoiceMessage(activeChannel.id, formData);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      recorder.stop();
      });

      setRecorderMessage('Enviado');
    } finally {
      webRecorderRef.current = null;
      webStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      webStreamRef.current = null;
      webChunksRef.current = [];
      stopWebMetering();
      stopRecordingTicker();
      syncRecordingAnimation(false);
      setRecordingMode('idle');
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

    if (!activeChannel || !supportsTapToTalk || isSubmitting || currentRecordingState === 'uploading') {
      return;
    }

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
      setRecorderMessage(isPermissionError ? 'Mic bloqueado' : 'Audio no disponible');
      if (isPermissionError) {
        setAudioPermissionState('denied');
      }
    }
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
  const liveStatus = recordingState === 'recording' ? 'Grabando' : recordingState === 'uploading' ? 'Enviando' : 'En espera';
  const audioSettingsPanel =
    showSettings && Platform.OS === 'web' ? (
      <View style={styles.settingsPanel}>
        <View style={styles.sectionRow}>
          <View style={styles.audioStatusRow}>
            <View style={[styles.audioStatusDot, { backgroundColor: permissionTone }]} />
            <MaterialCommunityIcons name="headphones" size={18} color={theme.colors.text} />
          </View>
          <Pressable
            onPress={() => void requestAudioDeviceAccess()}
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
      scroll={true}
      sectionKey="radio"
      contentContainerStyle={styles.container}
      header={
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Radio operativo</Text>
            <View style={styles.headerPills}>
              <StatusPill label={`${radioChannels.length} canales`} tone="info" />
              <StatusPill
                label={liveStatus}
                tone={recordingState === 'recording' ? 'danger' : 'positive'}
              />
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
      <View style={styles.layout}>
        <View style={styles.directoryPanel}>
          <View style={styles.searchShell}>
            <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar canal o contacto"
              placeholderTextColor={theme.colors.muted}
              style={styles.searchInput}
            />
          </View>

          <Pressable onPress={() => void handleOpenGeneralRadio()} style={styles.quickActionCard}>
            <View style={styles.quickActionLead}>
              <MaterialCommunityIcons name="radio-tower" size={20} color="#FFFFFF" />
              <Text style={styles.quickActionTitle}>Abrir radio general</Text>
            </View>
            <MaterialCommunityIcons name="radio-handheld" size={22} color="#FFFFFF" />
          </Pressable>

          <ScrollView
            style={isDesktop ? styles.directoryScroll : undefined}
            contentContainerStyle={styles.directoryContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={isDesktop}>
            <View style={styles.sectionBlock}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Canales</Text>
                <StatusPill label={`${filteredChannels.length}`} tone="info" />
              </View>

              {filteredChannels.map((channel) => {
                const contact = getConversationContact(channel, user.id);
                const isActive = channel.id === activeChannel?.id;

                return (
                  <Pressable
                    key={channel.id}
                    onHoverIn={Platform.OS === 'web' ? () => setHoveredRadioItemId(channel.id) : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setHoveredRadioItemId(null) : undefined}
                    onPress={() => void handleSelectChannel(channel.id)}
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
                        <Text style={styles.channelTitle}>{channel.title}</Text>
                        {contact ? <Text style={styles.channelMeta}>{formatRole(contact.role)}</Text> : null}
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
                  onPress={() => void handleOpenDirectRadio(contact.id)}
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
          </ScrollView>
        </View>

        <View style={styles.stagePanel}>
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
                  label={liveStatus}
                  tone={recordingState === 'recording' ? 'danger' : 'info'}
                />
                <StatusPill
                  label={activeChannel?.encrypted ? 'Cifrado activo' : 'Operación segura'}
                  tone={activeChannel?.encrypted ? 'positive' : 'neutral'}
                />
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
                  onPress={() => void handleTapToTalk()}
                  disabled={!supportsTapToTalk || isBusy || !activeChannel}
                  style={[
                    styles.pttButton,
                    recordingState === 'recording'
                      ? styles.pttButtonRecording
                      : styles.pttButtonIdle,
                    (!supportsTapToTalk || isBusy || !activeChannel)
                      ? styles.pttButtonDisabled
                      : undefined,
                  ]}>
                  {recordingState === 'uploading' ? (
                    <ActivityIndicator color="#FFFFFF" size="large" />
                  ) : (
                    <MaterialCommunityIcons name="microphone" size={58} color="#FFFFFF" />
                  )}
                  <Text style={styles.pttButtonTitle}>
                    {recordingState === 'recording' ? formatDuration(recordingSeconds) : 'Tap to Talk'}
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
                  name={recordingState === 'recording' ? 'record-circle' : 'circle'}
                  size={18}
                  color={recordingState === 'recording' ? theme.colors.danger : theme.colors.success}
                />
                <Text style={styles.metricValue}>
                  {recordingState === 'recording' ? 'Al aire' : 'En espera'}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="timer-outline" size={18} color={theme.colors.muted} />
                <Text style={styles.metricValue}>
                  {recordingState === 'recording'
                    ? formatDuration(recordingSeconds)
                    : formatDuration(MAX_RADIO_NOTE_SECONDS)}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <MaterialCommunityIcons name="access-point" size={18} color={theme.colors.muted} />
                <Text style={styles.metricValue}>
                  {supportsTapToTalk ? `${MAX_RADIO_NOTE_SECONDS}s` : 'No disponible'}
                </Text>
              </View>
            </View>

            {recorderMessage ? <Text style={styles.heroNote}>{recorderMessage}</Text> : null}
          </View>

          <View style={styles.historyPanel}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Actividad reciente</Text>
              <StatusPill label={`${recentVoiceNotes.length}`} tone="info" />
            </View>

            <ScrollView
              style={isDesktop ? styles.historyScroll : undefined}
              contentContainerStyle={styles.historyContent}
              showsVerticalScrollIndicator={false}
              scrollEnabled={isDesktop}>
              {recentVoiceNotes.length ? (
                recentVoiceNotes.map((message) => (
                  <VoiceTransmissionCard
                    key={message.id}
                    message={message}
                    token={token}
                    theme={theme}
                  />
                ))
              ) : (
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
                </View>
              )}
            </ScrollView>
          </View>
        </View>
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
  message,
  token,
  theme,
}: {
  message: ChatMessage;
  token: string | null;
  theme: ReturnType<typeof useAppTheme>['theme'];
  outputDeviceId?: string;
}) {
  const resolvedUrl = resolveAssetUrl(message.audioUrl);
  const player = useAudioPlayer(
    resolvedUrl
      ? {
          uri: resolvedUrl,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      : null
  );
  const playerStatus = useAudioPlayerStatus(player);
  const isPlaying = Boolean(playerStatus.playing);

  const handleTogglePlayback = () => {
    if (isPlaying) {
      (player as any).pause?.();
      return;
    }

    player.play();
  };

  return (
    <Pressable
      onPress={handleTogglePlayback}
      style={[
        styles.voiceCard,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: isPlaying ? theme.colors.accent : theme.colors.line,
          ...(Platform.OS === 'web' && isPlaying
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
              {formatRelativeTime(message.createdAt)}
            </Text>
          </View>
        </View>
        <View style={styles.voiceMetaPill}>
          <MaterialCommunityIcons name="clock-outline" size={13} color={theme.colors.muted} />
          <Text style={[styles.voiceMetaText, { color: theme.colors.muted }]}>
            {formatDuration(message.durationSeconds || 0)}
          </Text>
        </View>
        <View
          style={[
            styles.voicePlayShell,
            {
              backgroundColor: isPlaying ? theme.colors.accent : theme.colors.surface,
              borderColor: isPlaying ? theme.colors.accent : theme.colors.line,
            },
          ]}>
          <MaterialCommunityIcons
            name={isPlaying ? 'pause' : 'play'}
            size={18}
            color={isPlaying ? '#FFFFFF' : theme.colors.text}
          />
        </View>
      </View>

      <View style={styles.voiceWaveRow}>
        {Array.from({ length: 18 }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.voiceWaveBar,
              {
                height: 7 + ((index * 5) % 18),
                backgroundColor: isPlaying ? theme.colors.accent : theme.colors.line,
                opacity: isPlaying ? 0.75 : 0.34,
              },
            ]}
          />
        ))}
      </View>
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
});

function createStyles(
  theme: ReturnType<typeof useAppTheme>['theme'],
  isDesktop: boolean,
  isPhone: boolean,
  isWideRadioLayout: boolean
) {
  return StyleSheet.create({
    container: {
      flex: isDesktop ? 1 : undefined,
      gap: AppTheme.spacing.md,
      backgroundColor: theme.colors.background,
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
      gap: 8,
      marginTop: 8,
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
      width: isWideRadioLayout ? 360 : '100%',
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
      maxHeight: isWideRadioLayout ? undefined : 560,
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
      flex: isWideRadioLayout ? 1.35 : undefined,
      minWidth: 0,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      justifyContent: 'space-between',
      padding: isPhone ? 16 : 20,
      gap: 16,
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
    heroDeviceBar: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      gap: 8,
    },
    pttCenter: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: isPhone ? 286 : isDesktop ? 250 : 300,
    },
    pttHalo: {
      position: 'absolute',
      width: isPhone ? 228 : isDesktop ? 224 : 270,
      height: isPhone ? 228 : isDesktop ? 224 : 270,
      borderRadius: 999,
      backgroundColor: theme.colors.accentSoft,
    },
    pttOuter: {
      width: isPhone ? 232 : isDesktop ? 206 : 242,
      height: isPhone ? 232 : isDesktop ? 206 : 242,
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
      gap: 10,
    },
    metricCard: {
      flexGrow: 1,
      minWidth: isPhone ? 96 : 140,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    metricValue: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 18,
      lineHeight: 22,
    },
    heroNote: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 20,
    },
    historyPanel: {
      flex: isWideRadioLayout ? 0.78 : undefined,
      minHeight: isDesktop ? undefined : isPhone ? 320 : 400,
      minWidth: isWideRadioLayout ? 330 : undefined,
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
      paddingBottom: 8,
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
