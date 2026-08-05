import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { BrandLogo } from '@/src/components/brand-logo';
import { SYNC_LOADING_MESSAGE, SYNC_SLOW_MESSAGE } from '@/src/utils/sync-copy';

/**
 * Estado de carga real, distinto del estado de error. Se muestra mientras la
 * sincronizacion sigue en curso; la pantalla de error solo aparece cuando la
 * peticion falla de verdad o se agota el timeout de arranque en frio.
 */
type BrandSyncLoaderProps = {
  /**
   * `slow` se activa cuando la espera se alarga: el backend corre en el tier
   * gratuito de Render y puede tardar en despertar, asi que lo comunicamos en
   * vez de dejar al usuario leyendo un mensaje que parece un cuelgue.
   */
  stage?: 'loading' | 'slow';
  message?: string;
};

const BAR_COUNT = 5;
const BAR_WIDTH = 5;
const MIN_HEIGHT = 10;
const MAX_HEIGHT = 30;

export function BrandSyncLoader({ stage = 'loading', message }: BrandSyncLoaderProps) {
  const { theme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const caption = message || (stage === 'slow' ? SYNC_SLOW_MESSAGE : SYNC_LOADING_MESSAGE);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <BrandLogo align="center" size="md" tone={theme.mode === 'light' ? 'dark' : 'light'} />
      <View style={styles.wave}>
        {Array.from({ length: BAR_COUNT }).map((_, index) => (
          <BrandWaveBar
            color={theme.colors.accent}
            index={index}
            key={index}
            reducedMotion={reducedMotion}
          />
        ))}
      </View>
      <Text style={[styles.caption, { color: theme.colors.muted }]}>{caption}</Text>
    </View>
  );
}

function BrandWaveBar({
  color,
  index,
  reducedMotion,
}: {
  color: string;
  index: number;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);

    if (reducedMotion) {
      progress.value = 0.42;
      return () => cancelAnimation(progress);
    }

    progress.value = withDelay(
      index * 75,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 360, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 360, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );

    return () => cancelAnimation(progress);
  }, [index, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const height = MIN_HEIGHT + progress.value * (MAX_HEIGHT - MIN_HEIGHT);

    return {
      opacity: 0.45 + progress.value * 0.55,
      transform: [{ scaleY: height / MAX_HEIGHT }],
    };
  });

  return <Animated.View style={[styles.bar, { backgroundColor: color }, animatedStyle]} />;
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: BAR_WIDTH,
    height: MAX_HEIGHT,
    width: BAR_WIDTH,
  },
  caption: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
    textAlign: 'center',
  },
  root: {
    alignItems: 'center',
    flex: 1,
    gap: AppTheme.spacing.lg,
    justifyContent: 'center',
    paddingHorizontal: AppTheme.spacing.xl,
  },
  wave: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppTheme.spacing.xs,
    height: MAX_HEIGHT,
  },
});
