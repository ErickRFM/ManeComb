import { StyleSheet, View } from 'react-native';
import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type SkeletonBlockProps = {
  height?: number;
  width?: number | string;
  radius?: number;
};

export function SkeletonBlock({ height = 18, width = '100%', radius = AppTheme.radius.xs }: SkeletonBlockProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={[
        styles.block,
        {
          backgroundColor: theme.mode === 'light' ? theme.colors.surfaceAlt : 'rgba(255,255,255,0.08)',
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
    overflow: 'hidden',
  },
});
