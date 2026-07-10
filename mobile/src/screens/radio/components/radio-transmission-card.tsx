import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import {
  getAudioPlaybackErrorMessage,
  stopActiveAudioPlaybackAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from '@/src/native/audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Typography } from '@/constants/theme';
import { getAuthHeaderSnapshot, resolveAssetUrl } from '@/src/api/client';
import { UserAvatar } from '@/src/components/user-avatar';
import type { useAppTheme } from '@/src/hooks/use-app-theme';
import type { ChatMessage } from '@/src/types/app';
import { formatRelativeTime } from '@/src/utils/format';
import type { VoicePlaybackChangeMeta, VoicePlaybackPhase } from '../types';
import { clampVolume, formatDuration, getVoiceWaveformBars, logRadioDevelopmentEvent } from '../utils/radio-format';

export function VoiceTransmissionCard({
  channelTitle,
  isActive,
  message,
  onPlaybackChange,
  token,
  theme,
}: {
  channelTitle?: string;
  isActive?: boolean;
  message: ChatMessage;
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
        elapsedMs,
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
    async () => {
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
        transitionPlayback('LOADING', 'LOAD');

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
      player,
      resolvedUrl,
      transitionPlayback,
    ]
  );

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
