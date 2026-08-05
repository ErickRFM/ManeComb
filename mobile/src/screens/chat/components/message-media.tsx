import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useVideoPlayer, VideoView } from '@/src/native/video';
import { getAudioPlaybackErrorMessage, useAudioPlayer, useAudioPlayerStatus } from '@/src/native/audio';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Share, Text, View } from 'react-native';
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
  time: string;
  isCompact: boolean;
  isPhone: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);

  return (
    <View style={styles.messageDeliveryMeta}>
      <Text style={[styles.messageTime, isOwn ? styles.messageTimeOwn : undefined]}>{time}</Text>
      {isOwn ? (
        <MaterialCommunityIcons
          name={status === 'read' ? 'check-all' : status === 'delivered' ? 'check-all' : 'check'}
          size={14}
          color={status === 'read' ? theme.colors.info : 'rgba(255,255,255,0.72)'}
        />
      ) : null}
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
  isCompact: boolean;
  isPhone: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);
  const source = resolveAssetUrl(message.audioUrl);
  const player = useAudioPlayer(source ? { uri: source, headers: token ? { Authorization: `Bearer ${token}` } : undefined } : null);
  const status = useAudioPlayerStatus(player);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const durationSeconds = Math.max(0, Number(message.durationSeconds || status.duration || 0));
  const currentSeconds = Math.max(0, Math.min(durationSeconds || Number.MAX_SAFE_INTEGER, Number(status.currentTime || 0)));
  const progress = durationSeconds > 0 ? Math.min(1, currentSeconds / durationSeconds) : 0;
  const isPlaying = Boolean(status.playing);

  useEffect(() => {
    if (isActive && !isPlaying && status.didJustFinish) onDeactivate();
  }, [isActive, isPlaying, onDeactivate, status.didJustFinish]);

  const togglePlayback = async () => {
    if (!source) return;
    try {
      setPlaybackError(null);
      if (isPlaying) {
        await player.pause();
        onDeactivate();
        return;
      }
      onActivate(message.id);
      if (status.didJustFinish || (durationSeconds > 0 && currentSeconds >= durationSeconds - 0.2)) {
        await player.seekTo(0);
      }
      await player.play();
    } catch (error) {
      setPlaybackError(getAudioPlaybackErrorMessage(error));
      onDeactivate();
    }
  };

  return (
    <View style={styles.voiceNoteShell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        onPress={() => { togglePlayback(); }}
        style={[
          styles.voicePlayButton,
          isOwn ? styles.voicePlayButtonOwn : undefined,
        ]}>
        <MaterialCommunityIcons
          name={isPlaying ? 'pause' : 'play'}
          size={18}
          color={isOwn ? '#FFFFFF' : theme.colors.text}
        />
      </Pressable>
      <View style={styles.voiceNoteContent}>
        <View style={styles.voiceProgressTrack}>
          <View
            style={[
              styles.voiceProgressFill,
              isOwn ? styles.voiceProgressFillOwn : undefined,
              { width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
        <View style={styles.voiceNoteMetaRow}>
          <Text style={[styles.voiceDuration, isOwn ? styles.voiceDurationOwn : undefined]}>
            {formatDuration(isPlaying ? currentSeconds : durationSeconds)}
          </Text>
          {message.transcript ? (
            <Text
              style={[styles.voiceTranscript, isOwn ? styles.voiceTranscriptOwn : undefined]}
              numberOfLines={2}>
              {message.transcript}
            </Text>
          ) : null}
        </View>
        {playbackError ? (
          <Text style={[styles.voiceTranscript, { color: theme.colors.danger }]}>{playbackError}</Text>
        ) : null}
      </View>
    </View>
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
  isCompact: boolean;
  isPhone: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);
  const source = resolveAssetUrl(message.imageUrl);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!source) return null;

  return (
    <>
      <Pressable onPress={() => setPreviewOpen(true)} style={styles.mediaPreviewButton}>
        <Image
          source={{ uri: source, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
          style={styles.imageMessage}
          resizeMode="cover"
        />
      </Pressable>
      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}>
        <Pressable style={styles.mediaModalBackdrop} onPress={() => setPreviewOpen(false)}>
          <Image
            source={{ uri: source, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
            style={styles.mediaModalImage}
            resizeMode="contain"
          />
          <View style={styles.mediaModalActions}>
            <Pressable
              onPress={() => { Share.share({ url: source }); }}
              style={styles.mediaModalAction}>
              <MaterialCommunityIcons name="share-variant" size={20} color="#FFFFFF" />
              <Text style={styles.mediaModalActionText}>Compartir</Text>
            </Pressable>
            <Pressable onPress={() => setPreviewOpen(false)} style={styles.mediaModalAction}>
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              <Text style={styles.mediaModalActionText}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
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
  isCompact: boolean;
  isPhone: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);
  const source = resolveAssetUrl(message.videoUrl);
  const player = useVideoPlayer(
    source ? { uri: source, headers: token ? { Authorization: `Bearer ${token}` } : undefined } : null,
    (instance) => {
      instance.loop = false;
    }
  );

  if (!source) return null;

  return (
    <View style={styles.videoMessageShell}>
      <VideoView
        player={player}
        style={styles.videoMessage}
        nativeControls
        contentFit="cover"
      />
    </View>
  );
}
