import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import {
  traceRadioE2e,
  useAudioPlayer,
  useAudioPlayerStatus,
} from '@/src/native/audio';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Typography } from '@/constants/theme';
import { getAuthHeaderSnapshot, resolveAssetUrl } from '@/src/api/client';
import { UserAvatar } from '@/src/components/user-avatar';
import type { useAppTheme } from '@/src/hooks/use-app-theme';
import type { ChatMessage } from '@/src/types/app';
import { formatRelativeTime } from '@/src/utils/format';
import { clampVolume, formatDuration } from '../utils/radio-format';
import { RadioWaveform } from './radio-waveform';

export function VoiceTransmissionCard({
  channelTitle,
  message,
  token,
  theme,
}: {
  channelTitle?: string;
  message: ChatMessage;
  token: string | null;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  const resolvedUrl = resolveAssetUrl(message.audioUrl);
  const player = useAudioPlayer(
    resolvedUrl
      ? {
          uri: resolvedUrl,
          getHeaders: () => getAuthHeaderSnapshot(token),
        }
      : null,
    { independent: true, playerId: message.id, updateInterval: 80 }
  );
  const playerStatus = useAudioPlayerStatus(player);
  const isPlaying = Boolean(playerStatus.isPlaying);
  const isBuffering = playerStatus.phase === 'LOADING' || playerStatus.phase === 'PREPARING';
  const fallbackDurationSeconds = Math.max(0, Number(message.durationSeconds || 0));
  const nativeDurationSeconds =
    Number(playerStatus.durationMillis || 0) / 1000;
  const nativeCurrentSeconds = Number(playerStatus.currentPosition || 0) / 1000;
  const hasPreparedMedia = Boolean(playerStatus.isPrepared && nativeDurationSeconds > 0);
  const durationSeconds = hasPreparedMedia ? nativeDurationSeconds : fallbackDurationSeconds;
  const currentSeconds = hasPreparedMedia ? nativeCurrentSeconds : 0;
  const progress = hasPreparedMedia ? currentSeconds / nativeDurationSeconds : 0;
  const showProgress = durationSeconds > 0 && playerStatus.isPrepared;
  const isPlaybackActive = isPlaying || isBuffering;
  const playbackError = playerStatus.phase === 'ERROR'
    ? playerStatus.error || 'No se pudo reproducir el audio.'
    : null;
  const playbackLevel = clampVolume(Number(playerStatus.level || 0));
  const [waveformBars, setWaveformBars] = useState<number[]>(() => Array(18).fill(0));
  const cardActive = isPlaybackActive;
  const playbackStateColor = playbackError
    ? theme.colors.danger
    : isBuffering || isPlaying
      ? theme.colors.info
      : playerStatus.phase === 'FINISHED'
        ? theme.colors.success
        : playerStatus.phase === 'PAUSED' && currentSeconds > 0
          ? theme.colors.warning
          : theme.colors.muted;
  const playbackStateLabel = playbackError
    ? 'Error de audio'
    : isBuffering
      ? 'Cargando'
      : isPlaying
        ? 'Reproduciendo'
        : playerStatus.phase === 'FINISHED'
          ? 'Finalizado'
          : playerStatus.phase === 'PAUSED' && currentSeconds > 0
          ? 'Pausado'
          : resolvedUrl
            ? 'Listo'
            : 'Sin audio';

  useEffect(() => {
    setWaveformBars(Array(18).fill(0));
  }, [resolvedUrl]);

  useEffect(() => {
    traceRadioE2e('history_card_render', {
      channelId: message.conversationId || null,
      createdAt: message.createdAt,
      messageId: message.id,
      resolvedAudio: Boolean(resolvedUrl),
    }).catch(() => undefined);
  }, [message.conversationId, message.createdAt, message.id, resolvedUrl]);

  useEffect(() => {
    if (!isPlaying) return;
    setWaveformBars((current) => {
      const sampleIndex = current.findIndex(
        (_, index) => progress <= (index + 1) / current.length
      );
      const targetIndex = sampleIndex < 0 ? current.length - 1 : sampleIndex;
      if (playbackLevel <= current[targetIndex]) return current;
      const next = [...current];
      next[targetIndex] = playbackLevel;
      return next;
    });
  }, [isPlaying, playbackLevel, playerStatus.currentPosition, progress]);

  const playTransmission = useCallback(
    async () => {
      if (!resolvedUrl) {
        return;
      }

      if (isPlaying || isBuffering) {
        return;
      }

      try {
        await player.play();
      } catch {}
    },
    [
      isBuffering,
      isPlaying,
      player,
      resolvedUrl,
    ]
  );

  const handleTogglePlayback = async () => {
    if (!resolvedUrl) {
      return;
    }

    if (isPlaying) {
      await player.pause();
      return;
    }

    await playTransmission();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isPlaying ? 'Pausar' : 'Reproducir'} audio de radio`}
      onPress={handleTogglePlayback}
      style={({ pressed }) => [
        styles.voiceCard,
        pressed ? styles.voiceCardPressed : undefined,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: cardActive || playbackError ? playbackStateColor : theme.colors.line,
          ...(Platform.OS === 'web' && cardActive
            ? { boxShadow: `0px 0px 18px ${theme.colors.infoSoft}` }
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
            color={cardActive ? playbackStateColor : theme.colors.muted}
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
              backgroundColor: cardActive ? playbackStateColor : theme.colors.surface,
              borderColor: cardActive ? playbackStateColor : theme.colors.line,
            },
          ]}>
          {isBuffering ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <MaterialCommunityIcons
              name={isPlaying ? 'pause' : 'play'}
              size={18}
              color={cardActive ? '#FFFFFF' : playbackStateColor}
            />
          )}
        </View>
      </View>

      <RadioWaveform
        samples={waveformBars}
        progress={progress}
        mode="compact"
        playing={isPlaying || isBuffering}
        recording={false}
        disabled={!resolvedUrl || Boolean(playbackError)}
      />

      <View style={styles.voiceStatusRow}>
        <View
          style={[
            styles.voiceStatusDot,
            {
              backgroundColor: playbackStateColor,
            },
          ]}
        />
        <Text
          style={[
            styles.voiceStatusText,
            {
              color: playbackStateColor,
            },
          ]}>
          {playbackStateLabel}
        </Text>
      </View>

      {playbackError ? (
        <Text style={[styles.voiceErrorText, { color: theme.colors.danger }]}>
          {playbackError}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  voiceCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  voiceCardPressed: {
    opacity: 0.9,
  },
  voiceCardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  voiceCardLead: {
    flex: 1,
    minWidth: 160,
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
