import { isAxiosError } from 'axios';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useVideoPlayer, VideoView } from '@/src/native/video';
import {
  getAudioPlaybackErrorMessage,
  useAudioPlayer,
  useAudioPlayerStatus,
} from '@/src/native/audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';
import {
  apiClient,
  getAuthHeaderSnapshot,
  resolveAssetUrl,
} from '@/src/api/client';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { ChatMessage } from '@/src/types/app';
import { formatDuration } from '../utils/conversation';
import type { MessageDeliveryStatus } from '../types';
import { createStyles } from '../chat-screen.styles';

type ImageLoadFailure =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'missing'
  | 'server'
  | 'unknown';

function classifyImageLoadFailure(error: unknown): ImageLoadFailure {
  if (!isAxiosError(error)) return 'unknown';
  if (!error.response) return 'network';

  if (error.response.status === 401) return 'unauthorized';
  if (error.response.status === 403) return 'forbidden';
  if (error.response.status === 404) return 'missing';
  if (error.response.status >= 500) return 'server';

  return 'unknown';
}

function getImageLoadFailureMessage(failure: ImageLoadFailure | null) {
  switch (failure) {
    case 'network':
      return 'Sin conexión. Se reintentará automáticamente al volver.';
    case 'unauthorized':
      return 'No pudimos renovar la sesión para cargar esta imagen.';
    case 'forbidden':
      return 'Tu cuenta ya no tiene acceso a esta imagen.';
    case 'missing':
      return 'Esta imagen ya no está disponible en el servidor.';
    case 'server':
      return 'El servidor no pudo entregar la imagen. Toca para reintentar.';
    default:
      return 'No se pudo cargar la imagen. Toca para reintentar.';
  }
}

export function MessageDeliveryMeta({
  status,
  isOwn,
  time,
  isCompact,
  isPhone,
}: {
  status: MessageDeliveryStatus;
  isOwn: boolean;
  time?: string;
  isCompact?: boolean;
  isPhone?: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(
    () => createStyles(theme, isCompact ?? false, isPhone ?? false),
    [theme, isCompact, isPhone]
  );
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
      label: 'Visto',
      color: theme.colors.info,
    },
    failed: {
      icon: 'alert-circle-outline',
      label: 'No enviado',
      color: theme.colors.danger,
    },
  }[status];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={config.label}
      accessibilityHint="Estado del mensaje"
      style={styles.deliveryMeta}>
      {time ? (
        <Text style={[styles.deliveryMetaText, { color: config.color }]}>{time}</Text>
      ) : null}
      {status === 'sending' ? (
        <ActivityIndicator size={12} color={config.color} />
      ) : (
        <MaterialCommunityIcons name={config.icon as any} size={14} color={config.color} />
      )}
    </View>
  );
}

export function VoiceMessageBubble({
  isActive,
  isOwn,
  message,
  onActivate,
  onDeactivate,
  token,
  isCompact,
  isPhone,
}: {
  isActive: boolean;
  isOwn: boolean;
  message: ChatMessage;
  onActivate: (messageId: string) => void;
  onDeactivate: () => void;
  token: string | null;
  isCompact?: boolean;
  isPhone?: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(
    () => createStyles(theme, isCompact ?? false, isPhone ?? false),
    [theme, isCompact, isPhone]
  );
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const resolvedAudioUrl = resolveAssetUrl(message.audioUrl);
  const player = useAudioPlayer(
    resolvedAudioUrl
      ? {
          uri: resolvedAudioUrl,
          getHeaders: () => getAuthHeaderSnapshot(token),
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
      if (playerStatus.playing) {
        await player.pause();
        return;
      }

      onActivate(message.id);

      if (
        playerStatus.isLoaded &&
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
      onPress={() => {
        void handlePlayback();
      }}
      style={styles.voiceMessageCard}>
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
        <View
          style={[
            styles.voiceProgressTrack,
            isOwn ? styles.voiceProgressTrackOwn : undefined,
          ]}>
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
            {formatDuration(currentSeconds)} /{' '}
            {formatDuration(durationSeconds || message.durationSeconds || 0)}
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

export function ImageMessageBubble({
  message,
  token,
  isCompact,
  isPhone,
}: {
  message: ChatMessage;
  token: string | null;
  isCompact?: boolean;
  isPhone?: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(
    () => createStyles(theme, isCompact ?? false, isPhone ?? false),
    [theme, isCompact, isPhone]
  );
  const networkStatus = useAppStore((state) => state.networkStatus);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [failureReason, setFailureReason] = useState<ImageLoadFailure | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const recoveryInFlightRef = useRef<Promise<boolean> | null>(null);
  const automaticRecoverySignatureRef = useRef<string | null>(null);
  const resolvedUrl = resolveAssetUrl(message.imageUrl);
  const recoveryScopeRef = useRef({ url: resolvedUrl, active: true });
  const terminalFailure = ['unauthorized', 'forbidden', 'missing'].includes(failureReason || '');
  const headers = getAuthHeaderSnapshot(token);
  const displayUrl = useMemo(() => {
    if (!resolvedUrl || retryKey === 0) return resolvedUrl;
    return `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}mediaRetry=${retryKey}`;
  }, [resolvedUrl, retryKey]);

  useEffect(() => {
    const scope = { url: resolvedUrl, active: true };
    recoveryScopeRef.current = scope;
    recoveryInFlightRef.current = null;
    automaticRecoverySignatureRef.current = null;
    setHasError(false);
    setFailureReason(null);
    setIsLoading(true);
    setIsRecovering(false);
    setIsFullscreen(false);
    setRetryKey(0);
    return () => { scope.active = false; };
  }, [resolvedUrl]);

  const recoverImage = useCallback(() => {
    if (!resolvedUrl || terminalFailure || networkStatus !== 'online') return Promise.resolve(false);
    if (recoveryInFlightRef.current) return recoveryInFlightRef.current;
    const scope = recoveryScopeRef.current;
    const isCurrent = () => scope.active && scope === recoveryScopeRef.current && scope.url === resolvedUrl;
    if (!isCurrent()) return Promise.resolve(false);

    const attempt = (async () => {
      setIsRecovering(true);
      setFailureReason(null);

      try {
        await apiClient.get(resolvedUrl, {
          headers: {
            ...getAuthHeaderSnapshot(token),
            Range: 'bytes=0-0',
          },
          responseType: 'arraybuffer',
        });

        if (!isCurrent()) return false;
        setHasError(false);
        setIsLoading(true);
        setRetryKey((current) => current + 1);
        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        setFailureReason(classifyImageLoadFailure(error));
        setHasError(true);
        setIsLoading(false);
        return false;
      } finally {
        if (isCurrent()) setIsRecovering(false);
      }
    })();

    recoveryInFlightRef.current = attempt;
    void attempt.finally(() => {
      if (recoveryInFlightRef.current === attempt) {
        recoveryInFlightRef.current = null;
      }
    });
    return attempt;
  }, [networkStatus, resolvedUrl, terminalFailure, token]);

  const requestAutomaticRecovery = useCallback(() => {
    if (!resolvedUrl || terminalFailure || networkStatus !== 'online' || recoveryInFlightRef.current) return;
    const signature = `${resolvedUrl}|${token || 'no-token'}|${networkStatus}`;
    if (automaticRecoverySignatureRef.current === signature) return;
    automaticRecoverySignatureRef.current = signature;
    void recoverImage();
  }, [networkStatus, recoverImage, resolvedUrl, terminalFailure, token]);

  useEffect(() => {
    if (networkStatus === 'offline') automaticRecoverySignatureRef.current = null;
    if (!hasError || isRecovering || networkStatus !== 'online') return;
    requestAutomaticRecovery();
  }, [hasError, isRecovering, networkStatus, requestAutomaticRecovery]);

  if (!resolvedUrl || !displayUrl) return null;

  return (
    <View style={styles.mediaContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={terminalFailure ? 'Imagen no disponible' : hasError ? 'Reintentar imagen' : 'Abrir imagen'}
        disabled={terminalFailure || isRecovering || (hasError && networkStatus !== 'online')}
        onPress={() => {
          if (hasError) {
            automaticRecoverySignatureRef.current = null;
            requestAutomaticRecovery();
            return;
          }
          if (!isRecovering) setIsFullscreen(true);
        }}
        style={styles.mediaPreviewShell}>
        {!terminalFailure ? <Image
          key={retryKey}
          source={{ uri: displayUrl, headers }}
          style={styles.messageImage}
          resizeMode="cover"
          onError={() => {
            setHasError(true);
            setIsLoading(false);
            if (networkStatus !== 'online') setFailureReason('network');
            requestAutomaticRecovery();
          }}
          onLoad={() => {
            setHasError(false);
            setFailureReason(null);
            setIsLoading(false);
            automaticRecoverySignatureRef.current = null;
          }}
          onLoadStart={() => {
            setIsLoading(true);
            setHasError(false);
          }}
        /> : <View testID="unavailable-image-placeholder" style={styles.messageImage} />}
        {isLoading || isRecovering ? (
          <View style={styles.mediaLoadingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.mediaStateText}>
              {isRecovering ? 'Recuperando imagen...' : 'Cargando imagen...'}
            </Text>
          </View>
        ) : null}
        {hasError && !isRecovering ? (
          <View style={styles.mediaErrorBox}>
            <MaterialCommunityIcons
              name="image-off-outline"
              size={24}
              color={theme.colors.warning}
            />
            <Text style={[styles.mediaStateText, { color: theme.colors.warning }]}>
              {getImageLoadFailureMessage(failureReason)}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {message.text ? <Text style={styles.mediaCaption}>{message.text}</Text> : null}

      <Modal
        visible={isFullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFullscreen(false)}>
        <View style={styles.fullscreenOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar imagen"
            style={styles.closeFullscreen}
            onPress={() => setIsFullscreen(false)}>
            <MaterialCommunityIcons name="close" size={30} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartir imagen"
            style={styles.downloadFullscreen}
            onPress={() => {
              void Share.share({ url: resolvedUrl, message: resolvedUrl });
            }}>
            <MaterialCommunityIcons name="share-variant" size={26} color="#FFFFFF" />
          </Pressable>
          {!terminalFailure ? <Image
            source={{ uri: displayUrl, headers }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          /> : null}
        </View>
      </Modal>
    </View>
  );
}

export function VideoMessageBubble({
  message,
  token,
  isCompact,
  isPhone,
}: {
  message: ChatMessage;
  token: string | null;
  isCompact?: boolean;
  isPhone?: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(
    () => createStyles(theme, isCompact ?? false, isPhone ?? false),
    [theme, isCompact, isPhone]
  );
  const resolvedUrl = resolveAssetUrl(message.videoUrl);
  const headers = useMemo(
    () => getAuthHeaderSnapshot(token),
    [token]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const playbackUrl = resolvedUrl
    ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}retry=${retryKey}`
    : null;
  const videoSource = useMemo(
    () => playbackUrl ? { uri: playbackUrl, headers } : null,
    [headers, playbackUrl]
  );
  const player = useVideoPlayer(
    videoSource,
    (videoPlayer) => {
      videoPlayer.loop = false;
    }
  );

  useEffect(() => {
    if (player.status.isLoaded) {
      setIsLoading(false);
      setHasError(false);
    }
    if (player.status.error) {
      setHasError(true);
      setIsLoading(false);
    }
  }, [player.status.error, player.status.isLoaded]);

  if (!resolvedUrl) return null;

  return (
    <View style={styles.mediaContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasError ? 'Reintentar video' : 'Video del mensaje'}
        disabled={!hasError}
        onPress={() => {
          setHasError(false);
          setIsLoading(true);
          setRetryKey((current) => current + 1);
        }}
        style={styles.mediaPreviewShell}>
        <VideoView
          player={player}
          style={styles.messageVideo}
          allowsFullscreen
          allowsPictureInPicture
          nativeControls
        />
        {isLoading ? (
          <View style={styles.mediaLoadingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.mediaStateText}>Cargando video...</Text>
          </View>
        ) : null}
        {hasError ? (
          <View style={styles.mediaErrorBox}>
            <MaterialCommunityIcons
              name="video-off-outline"
              size={24}
              color={theme.colors.warning}
            />
            <Text style={[styles.mediaStateText, { color: theme.colors.warning }]}>
              No se pudo cargar el video. Toca para reintentar.
            </Text>
          </View>
        ) : null}
      </Pressable>
      {message.text ? <Text style={styles.mediaCaption}>{message.text}</Text> : null}
    </View>
  );
}
