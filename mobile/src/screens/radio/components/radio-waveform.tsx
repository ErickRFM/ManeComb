import { DesignSystem } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { clampVolume, getProgressBarFill } from '../utils/radio-format';

export type RadioWaveformMode = 'compact' | 'live';

type RadioWaveformProps = {
  samples: readonly number[] | SharedValue<number[]>;
  progress: number;
  mode: RadioWaveformMode;
  playing: boolean;
  recording: boolean;
  disabled: boolean;
};

const WAVEFORM_MOTION = {
  duration: 84,
  easing: Easing.linear,
};

function isSharedSamples(
  samples: RadioWaveformProps['samples']
): samples is SharedValue<number[]> {
  return !Array.isArray(samples) && 'value' in samples;
}

export function RadioWaveform({
  samples,
  progress,
  mode,
  playing,
  recording,
  disabled,
}: RadioWaveformProps) {
  const { theme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const localSamples = useSharedValue<number[]>(
    Array.isArray(samples) ? samples.map(clampVolume) : []
  );
  const sampleSource = isSharedSamples(samples) ? samples : localSamples;
  const normalizedProgress = clampVolume(progress);
  const activeColor = disabled
    ? theme.colors.muted
    : recording
      ? theme.colors.danger
      : playing
        ? theme.colors.info
        : normalizedProgress > 0
          ? theme.colors.warning
          : theme.colors.accent;
  const barCount = Array.isArray(samples) ? Math.max(1, samples.length) : 18;

  useEffect(() => {
    if (Array.isArray(samples)) {
      localSamples.value = samples.map(clampVolume);
    }
  }, [localSamples, samples]);

  return (
    <View
      accessible={false}
      style={[
        styles.row,
        mode === 'live' ? styles.liveRow : styles.compactRow,
        disabled ? styles.disabled : undefined,
      ]}>
      {Array.from({ length: barCount }).map((_, index) => (
        <RadioWaveformBar
          key={index}
          activeColor={activeColor}
          baseColor={theme.colors.line}
          fill={getProgressBarFill(normalizedProgress, index, barCount)}
          index={index}
          mode={mode}
          reducedMotion={reducedMotion}
          samples={sampleSource}
        />
      ))}
    </View>
  );
}

function RadioWaveformBar({
  activeColor,
  baseColor,
  fill,
  index,
  mode,
  reducedMotion,
  samples,
}: {
  activeColor: string;
  baseColor: string;
  fill: number;
  index: number;
  mode: RadioWaveformMode;
  reducedMotion: boolean;
  samples: SharedValue<number[]>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const level = Math.max(0, Math.min(1, samples.value[index] || 0));
    const minimum = mode === 'live' ? 7 : 4;
    const amplitude = mode === 'live' ? 43 : 24;
    const targetHeight = minimum + level * amplitude;

    return {
      height: reducedMotion
        ? targetHeight
        : withTiming(targetHeight, WAVEFORM_MOTION),
    };
  }, [mode, reducedMotion]);

  return (
    <Animated.View style={[styles.bar, { backgroundColor: baseColor }, animatedStyle]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: activeColor,
            width: `${fill * 100}%`,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  compactRow: {
    height: 30,
  },
  liveRow: {
    height: 50,
  },
  disabled: {
    opacity: DesignSystem.opacity.disabled,
  },
  bar: {
    flex: 1,
    minWidth: 0,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
