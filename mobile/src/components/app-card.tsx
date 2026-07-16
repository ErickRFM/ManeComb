import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { DesignSystem } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function AppCard({ children, style }: AppCardProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.mode === 'light' ? theme.colors.lineStrong : theme.colors.line,
          ...(Platform.OS === 'web'
            ? {
                boxShadow: `0px ${theme.shadow.card.shadowOffset.height}px ${theme.shadow.card.shadowRadius}px ${theme.shadow.card.shadowColor}`,
              }
            : {
                shadowColor: theme.shadow.card.shadowColor,
                shadowOpacity: theme.shadow.card.shadowOpacity,
                shadowRadius: theme.shadow.card.shadowRadius,
                shadowOffset: theme.shadow.card.shadowOffset,
                elevation: theme.shadow.card.elevation,
              }),
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: DesignSystem.radius.card,
    padding: 12,
    gap: 8,
    minWidth: 0,
  },
});
