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
const BAR_WIDTH = 5;
const MIN_HEIGHT = 5;
const MAX_EXTRA_HEIGHT = 34;
const VISUAL_DIAMETER_BOOST = 28;
const WAVEFORM_ATTACK_MS = 30;
const WAVEFORM_RELEASE_MS = 82;
const RING_ATTACK_MS = 34;
const RING_RELEASE_MS = 96;

function getReactiveLevel(samples: number[], index: number) {
  'worklet';

  const rawLevel = Math.max(0, Math.min(1, samples[index] || 0));
  // Curva deliberadamente sensible: levanta voz baja sin inventar audio y
  // mantiene margen para que los picos sigan viendose mas fuertes.
  return Math.min(1, Math.pow(rawLevel, 0.52) * 1.18);
}

function getRecentEnergy(samples: number[]) {
  'worklet';

  const last = samples.length - 1;
  const current = Math.max(0, Math.min(1, samples[last] || 0));
  const previous = Math.max(0, Math.min(1, samples[last - 1] || 0));
  const older = Math.max(0, Math.min(1, samples[last - 2] || 0));
  const energy = Math.max(current, previous * 0.82, older * 0.62);

  return Math.min(1, Math.pow(energy, 0.5) * 1.22);
}

export function PttAudioWave({ diameter, samples }: PttAudioWaveProps) {
  const { theme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const visualDiameter = diameter + VISUAL_DIAMETER_BOOST;
  const radius = visualDiameter / 2 - MAX_EXTRA_HEIGHT / 2;

  return (
    <View
      pointerEvents="none"
      style={[styles.container, { width: visualDiameter, height: visualDiameter }]}>
      <VoiceReactiveRing
        color={theme.colors.danger}
        diameter={visualDiameter - 8}
        reducedMotion={reducedMotion}
        samples={samples}
        visualDiameter={visualDiameter}
        strength={0.72}
      />
      <VoiceReactiveRing
        color={theme.colors.danger}
        diameter={visualDiameter + 8}
        reducedMotion={reducedMotion}
        samples={samples}
        visualDiameter={visualDiameter}
        strength={1}
      />

      {Array.from({ length: BAR_COUNT }).map((_, index) => {
        const angle = (index / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const x = visualDiameter / 2 + Math.cos(angle) * radius - BAR_WIDTH / 2;
        const y = visualDiameter / 2 + Math.sin(angle) * radius - MAX_EXTRA_HEIGHT / 2;

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

function VoiceReactiveRing({
  color,
  diameter,
  reducedMotion,
  samples,
  strength,
  visualDiameter,
}: {
  color: string;
  diameter: number;
  reducedMotion: boolean;
  samples: SharedValue<number[]>;
  strength: number;
  visualDiameter: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const level = getRecentEnergy(samples.value);
    const targetScale = 0.985 + level * 0.105 * strength;
    const targetOpacity = 0.055 + level * 0.24 * strength;

    if (reducedMotion) {
      return {
        opacity: targetOpacity,
        transform: [{ scale: targetScale }],
      };
    }

    const duration = level > 0.08 ? RING_ATTACK_MS : RING_RELEASE_MS;
    return {
      opacity: withTiming(targetOpacity, {
        duration,
        easing: Easing.out(Easing.quad),
      }),
      transform: [
        {
          scale: withTiming(targetScale, {
            duration,
            easing: Easing.out(Easing.cubic),
          }),
        },
      ],
    };
  }, [reducedMotion, strength]);

  const offset = (visualDiameter - diameter) / 2;

  return (
    <Animated.View
      style={[
        styles.reactiveRing,
        {
          borderColor: color,
          borderRadius: diameter / 2,
          height: diameter,
          left: offset,
          top: offset,
          width: diameter,
        },
        animatedStyle,
      ]}
    />
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
    const rawLevel = Math.max(0, Math.min(1, samples.value[index] || 0));
    const level = getReactiveLevel(samples.value, index);
    const targetHeight = MIN_HEIGHT + level * MAX_EXTRA_HEIGHT;
    const targetOpacity = 0.3 + level * 0.7;

    if (reducedMotion) {
      return {
        height: targetHeight,
        opacity: targetOpacity,
      };
    }

    const duration = rawLevel > 0.035 ? WAVEFORM_ATTACK_MS : WAVEFORM_RELEASE_MS;
    return {
      height: withTiming(targetHeight, {
        duration,
        easing: Easing.out(Easing.cubic),
      }),
      opacity: withTiming(targetOpacity, {
        duration,
        easing: Easing.out(Easing.quad),
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
    overflow: 'visible',
  },
  reactiveRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  bar: {
    position: 'absolute',
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH,
  },
});
