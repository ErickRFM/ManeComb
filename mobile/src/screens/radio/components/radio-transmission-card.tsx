import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import {
  getAudioPlaybackErrorMessage,
  useAudioPlayer,
  useAudioPlayerStatus,
} from '@/src/native/audio';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Typography } from '@/constants/theme';
import { getAuthHeaderSnapshot, resolveAssetUrl } from '@/src/api/client';
import { UserAvatar } from '@/src/components/user-avatar';
import type { useAppTheme } from '@/src/hooks/use-app-theme';
import type { ChatMessage } from '@/src/types/app';
import { formatRelativeTime } from '@/src/utils/format';
import { clampVolume, formatDuration } from '../utils/radio-format';

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
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const playbackLevel = clampVolume(Number(playerStatus.level || 0));
  const waveformBars = useMemo(() => {
    const barCount = 18;
    return Array.from({ length: barCount }, () => {
      if (!isPlaying) return 4;
      return Math.max(4, Math.round(4 + playbackLevel * 24));
    });
  }, [isPlaying, playbackLevel]);
  const cardActive = isPlaybackActive;
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
    setPlaybackError(null);
  }, [resolvedUrl]);

  const playTransmission = useCallback(
    async () => {
      if (!resolvedUrl) {
        setPlaybackError('URL de audio invalida.');
        return;
      }

      if (isPlaying || isBuffering) {
        return;
      }

      try {
        setPlaybackError(null);
        await player.play();
      } catch (error) {
        const playbackMessage = getAudioPlaybackErrorMessage(error);
        setPlaybackError(playbackMessage);
      }
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
      setPlaybackError('URL de audio invalida.');
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
