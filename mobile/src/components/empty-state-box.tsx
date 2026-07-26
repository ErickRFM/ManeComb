import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type EmptyStateBoxProps = {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  leading?: ReactNode;
  title: string;
  subtitle?: string;
};

export function EmptyStateBox({ icon, leading, title, subtitle }: EmptyStateBoxProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.box}>
      {leading ?? (icon ? <MaterialCommunityIcons name={icon} size={28} color={theme.colors.muted} /> : null)}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    box: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.sm,
      minHeight: 160,
      gap: 8,
      padding: 18,
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 16,
      fontWeight: '900',
      textAlign: 'center',
    },
    subtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      maxWidth: 420,
    },
  });
}
