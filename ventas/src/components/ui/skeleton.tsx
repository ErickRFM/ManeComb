import { StyleSheet, View } from 'react-native';
import { DesignSystem, palette } from '@/constants/theme';
import { shimmer } from '@/src/native/motion';

type SkeletonBlockProps = {
  height?: number;
  width?: number | string;
  radius?: number;
};

export function SkeletonBlock({ height = 18, width = '100%', radius = DesignSystem.radius.icon }: SkeletonBlockProps) {
  return (
    <View
      style={[
        styles.block,
        {
          backgroundColor: palette.skeleton,
          borderColor: palette.line,
          borderRadius: radius,
          height,
          width,
        },
      ]}>
      <View pointerEvents="none" style={[styles.shine, shimmer()]} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderWidth: 1,
    overflow: 'hidden',
    opacity: DesignSystem.opacity.skeleton,
  },
  shine: {
    ...StyleSheet.absoluteFillObject,
    ...(({
      backgroundImage:
        'linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.09) 50%, transparent 80%)',
    } as any)),
  },
});
