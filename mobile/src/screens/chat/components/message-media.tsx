import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useVideoPlayer, VideoView } from '@/src/native/video';
import { getAudioPlaybackErrorMessage, useAudioPlayer, useAudioPlayerStatus } from '@/src/native/audio';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, Share, Text, View } from 'react-native';
import { resolveAssetUrl } from '@/src/api/client';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { ChatMessage } from '@/src/types/app';
import { formatDuration } from '../utils/conversation';
import type { CallMode, MessageDeliveryStatus } from '../types';
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
  const styles = useMemo(() => createStyles(theme, isCompact ?? false, isPhone ?? false), [theme, isCompact, isPhone]);
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
  const styles = useMemo(() => createStyles(theme, isCompact ?? false, isPhone ?? false), [theme, isCompact, isPhone]);
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

export function ImageMessageBubble({ message, token, isCompact, isPhone }: { message: ChatMessage; token: string | null; isCompact?: boolean; isPhone?: boolean }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isCompact ?? false, isPhone ?? false), [theme, isCompact, isPhone]);
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
          <Pressable
            style={styles.downloadFullscreen}
            onPress={() => {
              Share.share({ url: resolvedUrl, message: resolvedUrl }).catch(() => undefined);
            }}>
            <MaterialCommunityIcons name="download" size={26} color="#FFFFFF" />
          </Pressable>
          <Image source={{ uri: resolvedUrl, headers }} style={styles.fullscreenImage} resizeMode="contain" />
        </View>
      </Modal>
    </View>
  );
}

export function VideoMessageBubble({ message, token, isCompact, isPhone }: { message: ChatMessage; token: string | null; isCompact?: boolean; isPhone?: boolean }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isCompact ?? false, isPhone ?? false), [theme, isCompact, isPhone]);
  const resolvedUrl = resolveAssetUrl(message.audioUrl);
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const player = useVideoPlayer(resolvedUrl ? { uri: resolvedUrl, headers } : null, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  useEffect(() => {
    if (player.status.isLoaded) {
      setIsLoading(false);
      setHasError(false);
    }
    if (player.status.error) {
      setHasError(true);
      setIsLoading(false);
    }
  }, [player.status.isLoaded, player.status.error]);

  if (!resolvedUrl) return null;

  return (
    <View style={styles.mediaContainer}>
      <Pressable
        disabled={hasError}
        onPress={() => {
          if (hasError) {
            setHasError(false);
            setIsLoading(true);
          }
        }}
        style={styles.mediaPreviewShell}>
        <VideoView player={player} style={styles.messageVideo} allowsFullscreen allowsPictureInPicture nativeControls />
        {isLoading ? (
          <View style={styles.mediaLoadingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.mediaStateText}>Cargando video...</Text>
          </View>
        ) : null}
        {hasError ? (
          <View style={styles.mediaErrorBox}>
            <MaterialCommunityIcons name="video-off-outline" size={24} color={theme.colors.warning} />
            <Text style={[styles.mediaStateText, { color: theme.colors.warning }]}>
              No se pudo cargar el video.
            </Text>
          </View>
        ) : null}
      </Pressable>
      {message.text ? <Text style={styles.mediaCaption}>{message.text}</Text> : null}
    </View>
  );
}

export function CallMediaTile({
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