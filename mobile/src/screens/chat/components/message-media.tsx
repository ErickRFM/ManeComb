import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useVideoPlayer, VideoView } from '@/src/native/video';
import {
  getAudioPlaybackErrorMessage,
  useAudioPlayer,
  useAudioPlayerStatus,
} from '@/src/native/audio';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';
import { resolveAssetUrl } from '@/src/api/client';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { ChatMessage } from '@/src/types/app';
import { formatDuration } from '../utils/conversation';
import type { MessageDeliveryStatus } from '../types';
import { createStyles } from '../chat-screen.styles';

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const resolvedUrl = resolveAssetUrl(message.imageUrl);
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  if (!resolvedUrl) return null;

  return (
    <View style={styles.mediaContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasError ? 'Reintentar imagen' : 'Abrir imagen'}
        onPress={() => {
          if (hasError) {
            setRetryKey((current) => current + 1);
            setHasError(false);
            setIsLoading(true);
            return;
          }
          setIsFullscreen(true);
        }}
        style={styles.mediaPreviewShell}>
        <Image
          key={retryKey}
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
            <MaterialCommunityIcons
              name="image-off-outline"
              size={24}
              color={theme.colors.warning}
            />
            <Text style={[styles.mediaStateText, { color: theme.colors.warning }]}>
              No se pudo cargar la imagen. Toca para reintentar.
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
          <Image
            source={{ uri: resolvedUrl, headers }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
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
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const playbackUrl = resolvedUrl
    ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}retry=${retryKey}`
    : null;
  const player = useVideoPlayer(
    playbackUrl ? { uri: playbackUrl, headers } : null,
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
