import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type ViewStyle } from 'react-native';
import { DesignSystem, getSkeletonColor } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type SkeletonBlockProps = {
  height?: number;
  width?: ViewStyle['width'];
  radius?: number;
};

export function SkeletonBlock({ height = 18, width = '100%', radius = DesignSystem.radius.icon }: SkeletonBlockProps) {
  const { theme } = useAppTheme();
  const pulse = useRef(new Animated.Value(DesignSystem.opacity.skeleton)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: DesignSystem.motion.slow * 2,
          easing: Easing.inOut(Easing.ease),
          toValue: 0.4,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: DesignSystem.motion.slow * 2,
          easing: Easing.inOut(Easing.ease),
          toValue: DesignSystem.opacity.skeleton,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.block,
        {
          backgroundColor: getSkeletonColor(theme),
          borderColor: theme.colors.line,
          borderRadius: radius,
          height,
          opacity: pulse,
          width,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    borderWidth: 1,
  },
});
