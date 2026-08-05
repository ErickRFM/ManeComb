import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

type PttAudioWaveProps = {
  diameter: number;
  samples: SharedValue<number[]>;
};

const BAR_COUNT = 18;
const BAR_WIDTH = 4;
const MIN_HEIGHT = 5;
const MAX_EXTRA_HEIGHT = 20;
const WAVEFORM_DURATION_MS = 76;

export function PttAudioWave({ diameter, samples }: PttAudioWaveProps) {
  const { theme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const radius = diameter / 2 - MAX_EXTRA_HEIGHT / 2;

  return (
    <View pointerEvents="none" style={[styles.container, { width: diameter, height: diameter }]}>
      {Array.from({ length: BAR_COUNT }).map((_, index) => {
        const angle = (index / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const x = diameter / 2 + Math.cos(angle) * radius - BAR_WIDTH / 2;
        const y = diameter / 2 + Math.sin(angle) * radius - MAX_EXTRA_HEIGHT / 2;

        return (
          <PttAudioWaveBar
            key={index}
            color={theme.colors.danger}
            index={index}
            left={x}
            reducedMotion={reducedMotion}
            rotation={(angle * 180) / Math.PI + 90}
            samples={samples}
            top={y}
          />
        );
      })}
    </View>
  );
}

function PttAudioWaveBar({
  color,
  index,
  left,
  reducedMotion,
  rotation,
  samples,
  top,
}: {
  color: string;
  index: number;
  left: number;
  reducedMotion: boolean;
  rotation: number;
  samples: SharedValue<number[]>;
  top: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const level = Math.max(0, Math.min(1, samples.value[index] || 0));
    const targetHeight = MIN_HEIGHT + level * MAX_EXTRA_HEIGHT;
    const targetOpacity = 0.42 + level * 0.58;

    if (reducedMotion) {
      return {
        height: targetHeight,
        opacity: targetOpacity,
      };
    }

    return {
      height: withTiming(targetHeight, {
        duration: WAVEFORM_DURATION_MS,
        easing: Easing.linear,
      }),
      opacity: withTiming(targetOpacity, {
        duration: WAVEFORM_DURATION_MS,
        easing: Easing.linear,
      }),
    };
  }, [index, reducedMotion]);

  return (
    <Animated.View style={[
      styles.bar,
      {
        backgroundColor: color,
        left,
        top,
        transform: [{ rotate: `${rotation}deg` }],
      },
      animatedStyle,
    ]} />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH,
  },
});
