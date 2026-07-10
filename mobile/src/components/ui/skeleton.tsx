import { StyleSheet, View, type ViewStyle } from 'react-native';
import { DesignSystem, getSkeletonColor } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type SkeletonBlockProps = {
  height?: number;
  width?: ViewStyle['width'];
  radius?: number;
};

export function SkeletonBlock({ height = 18, width = '100%', radius = DesignSystem.radius.icon }: SkeletonBlockProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={[
        styles.block,
        {
          backgroundColor: getSkeletonColor(theme),
          borderColor: theme.colors.line,
          borderRadius: radius,
          height,
          width,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    borderWidth: 1,
    opacity: DesignSystem.opacity.skeleton,
  },
});
